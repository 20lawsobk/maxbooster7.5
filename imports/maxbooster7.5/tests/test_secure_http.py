import socket
import unittest
from unittest.mock import patch

from secure_http import UnsafeURL, _validate_addresses, request


class SecureHTTPPolicyTests(unittest.TestCase):
    def test_public_policy_rejects_private_address(self):
        with self.assertRaisesRegex(UnsafeURL, "non-public"):
            _validate_addresses([(socket.AF_INET, "10.0.0.2")], False, False)

    def test_loopback_policy_accepts_only_loopback(self):
        _validate_addresses([(socket.AF_INET, "127.0.0.1")], False, True)
        with self.assertRaisesRegex(UnsafeURL, "loopback"):
            _validate_addresses([(socket.AF_INET, "10.0.0.2")], True, True)

    def test_target_must_match_trusted_origin_before_network(self):
        with patch("server.services.secure_http.socket.getaddrinfo") as resolver:
            with self.assertRaisesRegex(UnsafeURL, "outside"):
                request(
                    "https://evil.example/file",
                    trusted_origin="https://trusted.example",
                )
            resolver.assert_not_called()

    def test_custom_schemes_are_rejected(self):
        with self.assertRaisesRegex(UnsafeURL, "http and https"):
            request("file:///etc/passwd", trusted_origin="file:///")

    @patch("server.services.secure_http.http.client.HTTPConnection")
    @patch("server.services.secure_http.socket.socket")
    @patch(
        "server.services.secure_http._addresses",
        return_value=[(socket.AF_INET, "93.184.216.34")],
    )
    def test_redirect_is_refused(self, _addresses, socket_factory, connection):
        raw = connection.return_value.getresponse.return_value
        raw.status = 302
        raw.read.return_value = b""
        with self.assertRaisesRegex(UnsafeURL, "redirect refused"):
            request(
                "http://example.com/start",
                trusted_origin="http://example.com",
            )
        socket_factory.return_value.connect.assert_called_once()

    @patch("server.services.secure_http.http.client.HTTPConnection")
    @patch("server.services.secure_http.socket.socket")
    @patch(
        "server.services.secure_http._addresses",
        return_value=[(socket.AF_INET6, "2001:4860:4860::8888")],
    )
    def test_ipv6_host_header_uses_brackets_and_scheme_default_port(
        self, _addresses, _socket_factory, connection
    ):
        raw = connection.return_value.getresponse.return_value
        raw.status = 200
        raw.getheader.return_value = None
        raw.read.return_value = b"ok"
        request(
            "http://[2001:4860:4860::8888]:443/file",
            trusted_origin="http://[2001:4860:4860::8888]:443",
        )
        headers = connection.return_value.request.call_args.kwargs["headers"]
        self.assertEqual(headers["Host"], "[2001:4860:4860::8888]:443")


if __name__ == "__main__":
    unittest.main()