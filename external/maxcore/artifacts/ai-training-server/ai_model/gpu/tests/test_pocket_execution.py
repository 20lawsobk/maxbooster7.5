"""Real small-kernel/inference checks; no checkpoints or training involved."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import sqlite3
import threading
import os
import uuid
from contextlib import contextmanager
from pathlib import Path
import secrets
import select
import subprocess

import numpy as np
import pytest
import torch

from ai_model.gpu.hyper_core import HyperGPU
from ai_model.gpu.hyper_creative_transformer import HyperCreativeTransformerLM
from ai_model.gpu.pocket_pool import (
    PocketGPUPool, RequestScopedGPU, current_gpu_instance,
)
from ai_model.gpu.pocket_state import PDIMStateStore, encode_array, decode_array
from trusted_http import TrustedHTTPError


class DiskRecords:
    """Real durable test store with the production set/get contract."""
    def __init__(self, path):
        self.path = path
        with sqlite3.connect(path) as db:
            db.execute("CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT)")

    def set(self, key, value):
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT OR REPLACE INTO records VALUES (?, ?)", (key, json.dumps(value)))
        return True

    def get(self, key):
        with sqlite3.connect(self.path) as db:
            row = db.execute("SELECT value FROM records WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else None


@pytest.fixture
def pool(tmp_path):
    return PocketGPUPool(store=DiskRecords(tmp_path / "lives.sqlite"))


def test_real_prefill_decode_use_life_not_idle_model_gpu(pool):
    default = HyperGPU(lanes=2, tensor_cores=1)
    model = HyperCreativeTransformerLM(
        vocab_size=16, dim=8, n_layers=1, n_heads=2, max_len=8,
        dropout=0, gpu=default,
    ).eval()
    state_keys = tuple(model.state_dict())
    with torch.inference_mode(), pool.spawn_sync("inference") as life:
        logits, kv = model.prefill(torch.tensor([[1, 2, 3]]))
        decoded, _ = model.decode_one(torch.tensor([[4]]), kv)
        assert torch.isfinite(logits).all() and torch.isfinite(decoded).all()
        assert life.backend.gpu.core._total_ops > 0
        assert default.core._total_ops == 0
        measured = life.backend.gpu.core._total_ops
    assert tuple(model.state_dict()) == state_keys
    record = pool._store.get(f"gpu:life:{life.id}")
    assert record["state"] == "dead"
    assert record["kernel_ops"] == measured
    assert record["vram_used_bytes"] == 0
    assert current_gpu_instance() is None
    assert pool.stats()["pool_alive"] == 0


def test_concurrent_shared_proxy_isolation(pool):
    default = HyperGPU(lanes=2, tensor_cores=1)
    proxy = RequestScopedGPU(default)
    barrier = threading.Barrier(2)

    def run(value):
        with pool.spawn_sync(str(value)) as life:
            barrier.wait(timeout=10)
            result = proxy.gemm(np.full((2, 2), value), np.eye(2))
            np.testing.assert_allclose(result, value)
            assert proxy.core is life.backend.gpu.core
            return life.id, life.backend.gpu.core._total_ops

    with ThreadPoolExecutor(2) as executor:
        results = list(executor.map(run, [2, 3]))
    assert results[0][0] != results[1][0]
    assert all(count > 0 for _, count in results)
    assert default.core._total_ops == 0


def test_nested_scope_and_exception_cleanup(pool):
    with pool.spawn_sync("outer") as outer:
        with pytest.raises(ValueError, match="work failed"):
            with pool.spawn_sync("inner") as inner:
                inner.backend.gpu.vram.alloc(np.ones((2, 2)))
                raise ValueError("work failed")
        assert current_gpu_instance() is outer
        assert inner.backend.gpu.vram.used_bytes == 0
    assert pool.stats()["pool_total_born"] == pool.stats()["pool_total_dead"] == 2


def test_async_scope_propagates_to_thread(pool):
    async def run():
        async with pool.spawn("async") as life:
            actual = await asyncio.to_thread(current_gpu_instance)
            assert actual is life
    asyncio.run(run())
    assert pool.stats()["pool_total_dead"] == 1


def test_cancel_during_allocation_retires_unclaimed_life(pool, monkeypatch):
    entered = threading.Event()
    release = threading.Event()
    create = pool._create

    def slow_create(digest):
        entered.set()
        assert release.wait(timeout=10)
        return create(digest)

    monkeypatch.setattr(pool, "_create", slow_create)

    async def run():
        async def request():
            async with pool.spawn("cancelled"):
                pytest.fail("cancelled allocation must not yield")
        task = asyncio.create_task(request())
        assert await asyncio.to_thread(entered.wait, 10)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        release.set()
        for _ in range(200):
            if pool.stats()["pool_total_dead"] == 1:
                break
            await asyncio.sleep(0.01)
        assert pool.stats()["pool_total_dead"] == 1
        assert pool.stats()["pool_alive"] == 0
    asyncio.run(run())


def test_existing_storage_disk_adapter_persists_lifecycle(tmp_path, monkeypatch):
    from storage_client import _DiskStore
    monkeypatch.setattr(_DiskStore, "_DB_PATH", tmp_path / "production-store.sqlite")
    disk = _DiskStore()
    pool = PocketGPUPool(store=disk)
    with pool.spawn_sync("durable") as life:
        life.backend.gpu.gemm(np.eye(2), np.ones((2, 2)))
    reopened = _DiskStore()
    record = reopened.get(f"gpu:life:{life.id}")
    if isinstance(record, str):
        record = json.loads(record)
    assert record["state"] == "dead" and record["kernel_ops"] > 0
    disk._drop_conn()
    reopened._drop_conn()


def test_storage_failure_fails_admission_without_fake_life(pool, monkeypatch):
    monkeypatch.setattr(pool._store, "set", lambda *args: False)
    with pytest.raises(RuntimeError, match="rejected"):
        with pool.spawn_sync("unpersisted"):
            pytest.fail("must not admit work")
    assert pool.stats()["pool_total_born"] == 0
    assert pool.stats()["pool_alive"] == 0
    assert pool.stats()["pool_storage_errors"] == 1


def test_kernel_errors_propagate_without_math_fallback(pool, monkeypatch):
    proxy = RequestScopedGPU(HyperGPU(lanes=2, tensor_cores=1))
    with pool.spawn_sync("failure") as life:
        def fail(*args):
            raise RuntimeError("kernel failed")
        monkeypatch.setattr(life.backend.gpu.core, "tensor_core_gemm", fail)
        with pytest.raises(RuntimeError, match="kernel failed"):
            proxy.gemm(np.ones((2, 2)), np.eye(2))


def test_silicon_failure_does_not_abort_real_kernel():
    class BrokenEstimator:
        def model_op(self, *args, **kwargs):
            raise RuntimeError("estimator unavailable")
    gpu = HyperGPU(lanes=2, tensor_cores=1, silicon=BrokenEstimator())
    np.testing.assert_allclose(gpu.gemm(np.ones((2, 2)), np.eye(2)), 1)
    assert gpu.core._total_ops > 0


def _state_roundtrip(pool):
    model = HyperCreativeTransformerLM(
        vocab_size=16, dim=8, n_layers=1, n_heads=2, max_len=8,
        dropout=0, gpu=HyperGPU(lanes=2, tensor_cores=1),
    ).eval()
    arrays = [
        np.arange(24, dtype=">i4").reshape(4, 6)[:, ::2],
        np.array([np.nan, np.inf, -0.0], dtype=np.float64),
        np.empty((0, 3), dtype=np.float16),
        np.array(3.25, dtype=np.float32),
    ]
    with torch.inference_mode(), pool.spawn_sync("roundtrip") as source:
        handles = [source.backend.gpu.vram.alloc(a) for a in arrays]
        _, kv = model.prefill(torch.tensor([[1, 2, 3, 4]]))
        original = [(k.clone(), v.clone()) for k, v in kv]
        key = pool.save_state(source)
    # Discard process prefix state; recovery must retrieve from shared store.
    from ai_model.gpu.hyper_creative_transformer import _PREFIX_KV_CACHE
    _PREFIX_KV_CACHE.clear()
    with torch.inference_mode(), pool.spawn_sync("recovered") as recovered:
        payload = pool.restore_state(recovered, key)
        for handle, expected in zip(handles, arrays):
            actual = recovered.backend.gpu.vram.get(handle)
            assert actual.dtype == expected.dtype and actual.shape == expected.shape
            assert actual.tobytes() == expected.tobytes()
        for expected_pair, actual_pair in zip(original, payload["kv"]):
            for expected, actual in zip(expected_pair, actual_pair):
                assert torch.equal(expected, actual)
        # Actual recovered KV remains usable for the next GPU decode step.
        restored_logits, _ = model.decode_one(torch.tensor([[5]]), payload["kv"])
        reference_logits, _ = model.decode_one(torch.tensor([[5]]), original)
        assert torch.equal(restored_logits, reference_logits)
    return source.id


def test_lossless_state_roundtrip_and_decode(pool):
    _state_roundtrip(pool)


def test_canonical_pdim_state_roundtrip():
    url = os.environ.get("GPU_PDIM_TEST_URL")
    token = os.environ.get("GPU_PDIM_TEST_TOKEN")
    if not url or not token:
        pytest.skip("Canonical local PDIM test URL/private token not supplied")
    store = PDIMStateStore(url, token, namespace=f"gpu-test-{uuid.uuid4().hex}")
    pool = PocketGPUPool(store=store)
    source_id = _state_roundtrip(pool)
    # A separate client must retrieve exactly the same manifest/chunks.
    reopened = PDIMStateStore(url, token, namespace=store.namespace)
    assert reopened.get(f"gpu:state:{source_id}") == store.get(f"gpu:state:{source_id}")


@contextmanager
def _isolated_capsule_engine(snapshot, enveloped=False):
    """Canonical engine fixture, not the application or its running owner.

    The tiny transport adapter exposes the exact production CAPSULE command
    handlers. All compression, nested indexing and restoration is production
    LocalPdimCapsules/PocketDimension code; no mocked math or capsule store.
    """
    root = next(p for p in Path(__file__).resolve().parents if (p / "server/lib/localPdimCapsules.ts").exists())
    token = secrets.token_hex(32)
    script = r"""
import http from 'node:http';
import fs from 'node:fs';
import { RedisStore } from './external/pdim/artifacts/api-server/src/redis/store.ts';
import { LocalPdimCapsules } from './server/lib/localPdimCapsules.ts';
const entries = new Map(fs.existsSync(process.env.TEST_SNAPSHOT)
  ? JSON.parse(fs.readFileSync(process.env.TEST_SNAPSHOT, 'utf8')) : []);
const store = new RedisStore('gpu-state-test', 'isolated GPU state test');
store.attachEmbeddedSnapshot(entries);
const capsules = new LocalPdimCapsules(store, (changes, publish) => {
  const committed = new Map(entries);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) committed.delete(key);
    else committed.set(key, {type: 'string', value});
  }
  fs.writeFileSync(process.env.TEST_SNAPSHOT, JSON.stringify([...committed]), { flush: true });
  publish();
});
const server = http.createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.TEST_CHANNEL_TOKEN}`) {
    res.writeHead(403); res.end(JSON.stringify({error:'unauthorized'})); return;
  }
  try {
    let body = ''; for await (const chunk of req) body += chunk;
    const {cmd, args} = JSON.parse(body);
    const result = await capsules.exec(cmd, args);
    res.end(JSON.stringify(process.env.TEST_ENVELOPE === '1' ? {result} : result));
  } catch (error) { res.writeHead(500); res.end(JSON.stringify({error:String(error)})); }
});
server.listen(0, '127.0.0.1', () => console.log('READY ' + server.address().port));
process.on('SIGTERM', () => { store.closeEmbedded(); server.close(() => process.exit(0)); });
"""
    env = dict(os.environ, TEST_SNAPSHOT=str(snapshot), TEST_CHANNEL_TOKEN=token,
               TEST_ENVELOPE="1" if enveloped else "0")
    process = subprocess.Popen(
        ["node", "--import", "tsx", "--input-type=module", "-e", script],
        cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    try:
        assert select.select([process.stdout], [], [], 30)[0], "Canonical capsule fixture readiness timed out"
        line = process.stdout.readline()
        assert line.startswith("READY "), f"Canonical fixture not ready: {line}"
        url = f"http://127.0.0.1:{int(line.split()[1])}/exec"
        yield PDIMStateStore(url, token, namespace="gpu-canonical-test")
    finally:
        process.terminate()
        try:
            process.communicate(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()


def test_canonical_recursive_capsules_survive_owner_reconstruction(tmp_path):
    snapshot = tmp_path / "canonical.json"
    with _isolated_capsule_engine(snapshot) as store:
        source_id = _state_roundtrip(PocketGPUPool(store=store))
        saved = store.get(f"gpu:state:{source_id}")
        # Multiple transport chunks and real capsule decompression.
        large = encode_array(np.arange(100000, dtype=np.float64))
        assert store.set("gpu:large", large)
        assert store.get("gpu:large") == large
        unauthorized = PDIMStateStore(store.url, "invalid-test-token", namespace=store.namespace)
        with pytest.raises(RuntimeError, match="HTTP 403"):
            unauthorized.get("gpu:large")
    # Stopping only the isolated fixture must not uncover a SQLite or local
    # memory copy: canonical state reads fail closed during owner outage.
    with pytest.raises(TrustedHTTPError):
        store.get("gpu:large")
    persisted = json.loads(snapshot.read_text())
    assert any(key.startswith("pdim:capsule:ref:") for key, _ in persisted)
    with _isolated_capsule_engine(snapshot, enveloped=True) as recovered_store:
        assert recovered_store.get(f"gpu:state:{source_id}") == saved
        np.testing.assert_array_equal(decode_array(recovered_store.get("gpu:large")), np.arange(100000))
        recovered_pool = PocketGPUPool(store=recovered_store)
        with recovered_pool.spawn_sync("restart") as life:
            kv = recovered_pool.restore_state(life, f"gpu:state:{source_id}")
            assert kv["prefix_len"] == 4


def test_array_decoder_rejects_corrupt_shape():
    record = encode_array(np.ones((2, 3), dtype=np.float32))
    record["shape"] = [100, 100]
    with pytest.raises(ValueError, match="byte length"):
        decode_array(record)


def test_inplace_kv_decode_state_recovery(pool):
    from ai_model.model.transformer import KVCache
    model = HyperCreativeTransformerLM(
        vocab_size=16, dim=8, n_layers=1, n_heads=2, max_len=8,
        dropout=0, gpu=HyperGPU(lanes=2, tensor_cores=1),
    ).eval()
    with torch.inference_mode(), pool.spawn_sync("inplace") as life:
        _, kv = model.prefill(torch.tensor([[1, 2, 3]]))
        kv = KVCache.from_prefill(kv, max_new_tokens=3)
        _, kv = model.decode_one(torch.tensor([[4]]), kv)
        expected = [(k.clone(), v.clone()) for k, v in [kv[0]]]
    with pool.spawn_sync("recover-inplace") as restored:
        payload = pool.restore_state(restored, f"gpu:state:{life.id}")
        assert payload["prefix_len"] == 4
        assert torch.equal(payload["kv"][0][0], expected[0][0])
        assert torch.equal(payload["kv"][0][1], expected[0][1])


def test_cancelled_worker_drains_before_retirement(pool):
    entered, release = threading.Event(), threading.Event()
    lives = []
    def work(life):
        lives.append(life)
        entered.set()
        assert release.wait(timeout=10)
        assert life.state == "working"
        life.backend.gpu.gemm(np.eye(2), np.ones((2, 2)))
    async def run():
        task = asyncio.create_task(pool.run_in_worker(work, "cancel-work"))
        assert await asyncio.to_thread(entered.wait, 10)
        task.cancel()
        await asyncio.sleep(0.01)
        assert not task.done()
        assert lives[0].state == "working"
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert lives[0].state == "dead"
    asyncio.run(run())


def test_pool_compute_totals_include_active_and_retired_once(pool):
    assert pool.stats()["pool_total_kernel_ops"] == 0
    assert pool.stats()["pool_total_compute_ms"] == 0
    with pool.spawn_sync("outer-metrics") as outer:
        outer.backend.gpu.gemm(np.eye(3), np.ones((3, 2)))
        outer_ops = outer.backend.gpu.core._total_ops
        outer_ms = outer.backend.gpu._total_compute_ms
        assert outer_ops > 0 and outer_ms > 0
        first = pool.stats()
        assert first["pool_active_kernel_ops"] == outer_ops
        assert first["pool_retired_kernel_ops"] == 0
        assert first["pool_total_compute_ms"] == outer_ms
        with pool.spawn_sync("inner-metrics") as inner:
            inner.backend.gpu.gemm(np.eye(4), np.ones((4, 2)))
            inner_ops = inner.backend.gpu.core._total_ops
            inner_ms = inner.backend.gpu._total_compute_ms
            both = pool.stats()
            assert both["pool_active_kernel_ops"] == outer_ops + inner_ops
            assert both["pool_total_compute_ms"] == outer_ms + inner_ms
        mixed = pool.stats()
        assert mixed["pool_active_kernel_ops"] == outer_ops
        assert mixed["pool_retired_kernel_ops"] == inner_ops
        assert mixed["pool_total_kernel_ops"] == both["pool_total_kernel_ops"]
        assert mixed["pool_total_compute_ms"] == both["pool_total_compute_ms"]
    done = pool.stats()
    assert done["pool_active_kernel_ops"] == 0
    assert done["pool_active_compute_ms"] == 0
    assert done["pool_retired_kernel_ops"] == outer_ops + inner_ops
    assert done["pool_retired_compute_ms"] == outer_ms + inner_ms
    assert done["pool_total_kernel_ops"] == both["pool_total_kernel_ops"]
    assert not pool._live_instances  # no retained GPU/tensor references
    pool._register_death(inner)  # duplicate retirement must be idempotent
    assert pool.stats() == done


def test_state_write_failure_keeps_actual_retired_compute_totals(pool, monkeypatch):
    with pytest.raises(RuntimeError, match="PDIM rejected GPU state"):
        with pool.spawn_sync("failed-state-metrics") as life:
            life.backend.gpu.gemm(np.eye(2), np.ones((2, 2)))
            ops = life.backend.gpu.core._total_ops
            elapsed = life.backend.gpu._total_compute_ms
            monkeypatch.setattr(pool._store, "set", lambda *args: False)
    stats = pool.stats()
    assert stats["pool_alive"] == 0 and stats["pool_total_dead"] == 1
    assert stats["pool_total_kernel_ops"] == stats["pool_retired_kernel_ops"] == ops
    assert stats["pool_total_compute_ms"] == elapsed
    assert stats["pool_active_kernel_ops"] == 0


def test_concurrent_active_metrics_survive_worker_retirement(pool):
    ready = threading.Barrier(3)
    release = threading.Event()
    lives = []
    def work(value):
        with pool.spawn_sync(f"metrics-{value}") as life:
            life.backend.gpu.gemm(np.eye(3), np.full((3, 2), value))
            lives.append(life)
            ready.wait(timeout=10)
            assert release.wait(timeout=10)
    with ThreadPoolExecutor(2) as executor:
        futures = [executor.submit(work, value) for value in (5, 7)]
        ready.wait(timeout=10)
        expected_ops = sum(life.backend.gpu.core._total_ops for life in lives)
        expected_ms = sum(life.backend.gpu._total_compute_ms for life in lives)
        active = pool.stats()
        assert active["pool_active_kernel_ops"] == expected_ops
        assert active["pool_total_compute_ms"] == expected_ms
        release.set()
        for future in futures:
            future.result(timeout=10)
    retired = pool.stats()
    assert retired["pool_total_kernel_ops"] == expected_ops
    assert retired["pool_retired_kernel_ops"] == expected_ops
    assert retired["pool_total_compute_ms"] == expected_ms