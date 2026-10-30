"""Regression tests for the supplemental CPU Torch integrity gate."""
import base64
import hashlib
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("torch_provenance", Path(__file__).resolve().parents[1] / "scripts/verify-torch-provenance.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class ProvenanceTests(unittest.TestCase):
    def test_installed_record_verifies_real_bytes_then_rejects_tampering_and_missing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = b"real extension bytes"
            digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode().rstrip("=")
            record = f"torch/extension.so,sha256={digest},{len(data)}\ntorch.dist-info/RECORD,,\n"
            class Distribution:
                def read_text(self, name):
                    return record
                def locate_file(self, name):
                    return root / name
            target = root / "torch/extension.so"
            target.parent.mkdir()
            target.write_bytes(data)
            self.assertEqual(gate.verify_record(Distribution()), (1, []))
            target.write_bytes(b"modified")
            self.assertEqual(gate.verify_record(Distribution())[1], ["torch/extension.so"])
            target.unlink()
            self.assertEqual(gate.verify_record(Distribution())[1], ["torch/extension.so"])

    def test_only_unique_official_frozen_wheel_is_accepted(self):
        abi = f"cp{sys.version_info.major}{sys.version_info.minor}"
        wheel = {"url": f"https://download-r2.pytorch.org/whl/cpu/torch-2.13.0%2Bcpu-{abi}-{abi}-manylinux_2_28_x86_64.whl", "hash": "sha256:" + "a" * 64}
        package = {"name": "torch", "version": "2.13.0+cpu", "source": {"registry": "https://download.pytorch.org/whl/cpu"}, "wheels": [wheel]}
        with patch.object(gate.sysconfig, "get_platform", return_value="linux-x86_64"), patch.object(gate.sys, "platform", "linux"):
            self.assertEqual(gate.locked_wheel({"package": [package]}, package["version"]), wheel)
            package["wheels"] = [wheel, dict(wheel)]
            with self.assertRaisesRegex(ValueError, "unique"):
                gate.locked_wheel({"package": [package]}, package["version"])
            package["wheels"] = [{**wheel, "url": wheel["url"].replace("download-r2.pytorch.org", "untrusted.example")}]
            with self.assertRaisesRegex(ValueError, "origin"):
                gate.locked_wheel({"package": [package]}, package["version"])
            package["source"] = {"registry": "https://untrusted.example"}
            with self.assertRaisesRegex(ValueError, "official"):
                gate.locked_wheel({"package": [package]}, package["version"])


if __name__ == "__main__":
    unittest.main()
