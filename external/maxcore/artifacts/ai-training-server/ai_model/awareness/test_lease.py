"""Real Lua/Redis atomicity tests in an isolated temporary Unix-socket Redis.

No app workflow or production/private store is started, read or written.
"""
import json
import os
import shutil
import subprocess
import tempfile
import time
import types
import unittest
from unittest.mock import patch

from ai_model.awareness.engine import AwarenessUnavailable, Engine, PDIM, POINTER
from ai_model.awareness.lease import LEASE_KEY, PUBLISH
from ai_model.awareness.test_engine import MemoryStore, sources


@unittest.skipUnless(shutil.which("redis-server") and shutil.which("redis-cli"),
                     "isolated Redis executables required")
class AtomicLeaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="awareness-lease-test-")
        cls.socket = os.path.join(cls.temp.name, "redis.sock")
        cls.process = subprocess.Popen(
            ["redis-server", "--port", "0", "--unixsocket", cls.socket,
             "--save", "", "--appendonly", "no", "--dir", cls.temp.name],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            if os.path.exists(cls.socket):
                break
            time.sleep(.02)

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)
        cls.temp.cleanup()

    def cmd(self, *args):
        result = subprocess.run(
            ["redis-cli", "-s", self.socket, "--json", *map(str, args)],
            capture_output=True, text=True, timeout=3, check=True)
        return json.loads(result.stdout)

    def setUp(self):
        self.cmd("FLUSHDB")  # Isolated test socket only.
        storage = types.SimpleNamespace(_ns=lambda key: key)
        module = types.SimpleNamespace(get_storage=lambda: storage)
        self.patcher = patch.dict("sys.modules", {"storage_client": module})
        self.patcher.start()
        self.store = PDIM()
        self.store._command = self.cmd
        self.addCleanup(self.patcher.stop)
        self.snapshot = Engine(sources=sources(), store=MemoryStore()).refresh()

    def test_contenders_and_owner_checked_heartbeat_release(self):
        self.assertTrue(self.store.acquire("owner-a"))
        self.assertFalse(self.store.acquire("owner-b"))
        self.assertFalse(self.store.renew("owner-b"))
        self.assertFalse(self.store.release("owner-b"))
        self.assertTrue(self.store.renew("owner-a"))
        self.assertTrue(self.store.release("owner-a"))
        self.assertTrue(self.store.acquire("owner-b"))

    def test_lost_lease_cannot_overwrite_successor_pointer(self):
        self.assertTrue(self.store.acquire("old-owner"))
        self.cmd("DEL", LEASE_KEY)  # Simulate expiration before old work completes.
        self.assertTrue(self.store.acquire("new-owner"))
        newer = Engine(sources=sources(), store=MemoryStore()).refresh()
        self.store.publish(newer, owner="new-owner")
        with self.assertRaises(AwarenessUnavailable):
            self.store.publish(self.snapshot, owner="old-owner")
        self.assertEqual(self.store.get(POINTER)["id"], newer.id)

    def test_same_owner_out_of_order_publication_rejected(self):
        self.store.acquire("owner")
        newer = Engine(sources=sources(), store=MemoryStore()).refresh()
        self.store.publish(newer, owner="owner")
        with self.assertRaises(AwarenessUnavailable):
            self.store.publish(self.snapshot, owner="owner")
        self.assertEqual(self.store.get(POINTER)["id"], newer.id)

    def test_server_clock_rejects_expired_publication(self):
        self.store.acquire("owner")
        result = self.cmd("EVAL", PUBLISH, 3, LEASE_KEY, "expired-blob", POINTER,
                          "owner", "{}", "{}", time.time() - 100, time.time() - 1, "expired")
        self.assertEqual(result, -2)
        self.assertIsNone(self.store.get(POINTER))

    def test_published_snapshot_loads_into_follower_without_ingest(self):
        self.store.acquire("owner")
        self.store.publish(self.snapshot, owner="owner")
        follower = Engine(sources=sources(), store=self.store)
        follower._load()
        self.assertEqual(follower.require_snapshot().id, self.snapshot.id)
        with self.assertRaises(AwarenessUnavailable):
            follower.refresh()
        self.assertFalse(follower.status()["ingest_owner"])
        self.assertTrue(follower.status()["source_health"])
        self.assertGreater(follower.status()["snapshot_gpu"]["completed"], 0)

    def test_previous_id_only_pointer_migrates_without_regression(self):
        from ai_model.awareness.engine import canonical
        self.store.acquire("owner")
        self.store.publish(self.snapshot, owner="owner")
        self.cmd("SET", POINTER, canonical({"id": self.snapshot.id}))
        newer = Engine(sources=sources(), store=MemoryStore()).refresh()
        self.store.publish(newer, owner="owner")
        self.assertEqual(self.store.get(POINTER)["id"], newer.id)


if __name__ == "__main__":
    unittest.main()