import base64
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import socket
import sys
import threading
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_model.native_analysis import safe_http


class PublicFetchProxyTests(unittest.TestCase):
    def test_explicit_proxy_tunnels_the_validated_ip_and_never_leaks_proxy_auth(self):
        seen = {}
        class Proxy(BaseHTTPRequestHandler):
            def do_CONNECT(self):
                seen["target"] = self.path
                seen["proxy_auth"] = self.headers.get("Proxy-Authorization")
                self.send_response(200)
                self.end_headers()
                seen["request"] = self.rfile.readline().decode().strip()
                seen["origin_headers"] = http.client.parse_headers(self.rfile)
                self.wfile.write(b'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}')
                self.wfile.flush()
                self.close_connection = True
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), Proxy)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.object(safe_http, "_public_addresses", return_value=["93.184.216.34"]):
                raw, _ = safe_http.fetch_bytes("http://feed.example/items", max_bytes=100,
                    allowed_content_types=("application",),
                    proxy_url=f"http://fixture:password@127.0.0.1:{server.server_port}")
            self.assertEqual(raw, b"{}")
            self.assertEqual(seen["target"], "93.184.216.34:80")
            self.assertEqual(seen["request"], "GET /items HTTP/1.1")
            self.assertEqual(seen["origin_headers"]["Host"], "feed.example")
            self.assertIsNone(seen["origin_headers"].get("Proxy-Authorization"))
            self.assertIsNone(seen["origin_headers"].get("Authorization"))
            self.assertEqual(seen["proxy_auth"], "Basic " + base64.b64encode(b"fixture:password").decode())
        finally:
            server.shutdown()
            server.server_close()
            thread.join(3)

    def test_https_keeps_original_sni_and_certificate_verification(self):
        raw = Mock()
        with patch.object(safe_http, "_connect_pinned", return_value=raw) as connect:
            connection = safe_http._PinnedHTTPSConnection("feed.example", 443, "93.184.216.34", 2,
                                                        proxy_url="http://proxy.example")
            self.assertTrue(connection._context.check_hostname)
            wrapped = Mock()
            connection._context = Mock(wrap_socket=Mock(return_value=wrapped))
            connection.connect()
            connect.assert_called_once_with("93.184.216.34", 443, 2, "http://proxy.example")
            connection._context.wrap_socket.assert_called_once_with(raw, server_hostname="feed.example")

    def test_proxy_cannot_bypass_public_address_validation(self):
        answer = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))]
        with patch.object(safe_http, "_proxy_dns_records", return_value=answer), \
             patch.object(safe_http, "_connect_pinned") as connect:
            with self.assertRaisesRegex(safe_http.SafeHTTPError, "non-public"):
                safe_http.fetch_bytes("http://private.example/items", max_bytes=100,
                    allowed_content_types=("application",), proxy_url="http://proxy.example")
            connect.assert_not_called()

    def test_proxy_dns_answer_cannot_introduce_a_private_or_transition_address(self):
        for address in ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::ffff:127.0.0.1", "64:ff9b::a00:1"]:
            records = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 80))]
            with patch.object(safe_http, "_proxy_dns_records", return_value=records):
                with self.assertRaises(safe_http.SafeHTTPError):
                    safe_http._public_addresses("feed.example", 80, proxy_url="http://proxy.example")

    def test_invalid_proxy_origin_is_rejected(self):
        with self.assertRaisesRegex(safe_http.SafeHTTPError, "CONNECT origin"):
            safe_http._connect_pinned("93.184.216.34", 443, 1, "http://proxy.example/path")


if __name__ == "__main__":
    unittest.main()
