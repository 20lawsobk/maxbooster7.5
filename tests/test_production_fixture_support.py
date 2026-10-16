from pathlib import Path
import socket
import tempfile
import unittest

from production_fixture_support import native_binary, wait_ports_released


class FixtureContracts(unittest.TestCase):
    def test_missing_binary_fails_instead_of_skipping(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(RuntimeError, "requires executable"):
                native_binary(root)

    def test_prefers_packaged_binary_and_rejects_non_executable(self):
        with tempfile.TemporaryDirectory() as root:
            for relative in ("bin/boosterstate", "boosterstate/target/release/boosterstate"):
                path = Path(root) / relative
                path.parent.mkdir(parents=True)
                path.write_text("fixture")
                path.chmod(0o700)
            self.assertEqual(native_binary(root), Path("bin/boosterstate"))
            (Path(root) / "bin/boosterstate").chmod(0o600)
            self.assertEqual(native_binary(root), Path("boosterstate/target/release/boosterstate"))

    def test_listener_is_detected_and_closed_port_passes(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            with self.assertRaisesRegex(RuntimeError, str(port)):
                wait_ports_released([port], timeout=0)
        wait_ports_released([port], timeout=0)


if __name__ == "__main__":
    unittest.main()
