"""Real loopback streaming regressions, runnable with both app interpreters."""
import threading
import unittest
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib3


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        self.send_response(200)
        self.send_header("Transfer-Encoding", "chunked")
        if self.path == "/deflate":
            self.send_header("Content-Encoding", "deflate")
        self.end_headers()
        if self.path == "/oversized":
            # A huge unbounded line must be rejected before trying to parse it.
            self.wfile.write(b"1" * 70000 + b"\r\n")
            return
        data = zlib.compress(b"real streamed content" * 1000) + b"trailing bytes"
        self.wfile.write(f"{len(data):x}\r\n".encode() + data + b"\r\n0\r\n\r\n")


class StreamingSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.pool = urllib3.PoolManager(timeout=urllib3.Timeout(total=2), retries=False)

    @classmethod
    def tearDownClass(cls):
        cls.pool.clear()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_patched_import(self):
        self.assertGreaterEqual(tuple(map(int, urllib3.__version__.split("."))), (2, 8, 0))

    def test_deflate_trailing_bytes_do_not_loop(self):
        with self.pool.request("GET", self.base + "/deflate", preload_content=False) as response:
            result = b"".join(response.stream(amt=128, decode_content=True))
        self.assertEqual(result, b"real streamed content" * 1000)

    def test_chunk_size_line_is_bounded(self):
        with self.pool.request("GET", self.base + "/oversized", preload_content=False) as response:
            with self.assertRaises(urllib3.exceptions.ProtocolError):
                list(response.stream(amt=128))


if __name__ == "__main__":
    print(f"Testing urllib3 {urllib3.__version__} from {urllib3.__file__}")
    unittest.main()