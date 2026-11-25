"""Offline trust-boundary tests for configured service HTTP."""
import socket
import unittest
from unittest.mock import Mock, patch

from trusted_http import TrustedHTTPError, TrustedOrigin, request, validated_origin


class TrustedHTTPTests(unittest.TestCase):
    def test_local_only_rejects_non_loopback(self):
        with self.assertRaisesRegex(TrustedHTTPError, "loopback"):
            validated_origin("https://service.example/exec", local_only=True)
        self.assertEqual(
            validated_origin("http://127.0.0.1:9878", local_only=True),
            TrustedOrigin("http", "127.0.0.1", 9878, True),
        )

    @patch("trusted_http.socket.getaddrinfo")
    def test_local_only_rejects_if_any_dns_answer_is_not_loopback(self, resolver):
        resolver.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 9878)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.8", 9878)),
        ]
        origin = validated_origin("http://localhost:9878", local_only=True)
        with self.assertRaisesRegex(TrustedHTTPError, "only to loopback"):
            request("GET", "http://localhost:9878/health", origin=origin)

    def test_request_cannot_leave_configured_origin(self):
        origin = validated_origin("https://storage.internal/exec")
        with self.assertRaisesRegex(TrustedHTTPError, "outside"):
            request("POST", "https://other.internal/exec", origin=origin)

    @patch(
        "trusted_http._resolved_addresses",
        return_value=[(socket.AF_INET, "127.0.0.1")],
    )
    @patch("trusted_http._PinnedHTTPConnection")
    def test_redirect_is_rejected_without_following(
        self, connection_type, _resolved
    ):
        response = Mock(status=302)
        response.getheader.return_value = "https://attacker.example/"
        connection = connection_type.return_value
        connection.getresponse.return_value = response
        origin = validated_origin("http://127.0.0.1:8080")
        with self.assertRaisesRegex(TrustedHTTPError, "redirect"):
            request(
                "POST", "http://127.0.0.1:8080/exec", origin=origin,
                headers={"Authorization": "Bearer secret"},
            )
        connection.request.assert_called_once()
        connection.close.assert_called_once()

    @patch(
        "trusted_http._resolved_addresses",
        return_value=[(socket.AF_INET, "10.2.3.4")],
    )
    @patch("trusted_http._PinnedHTTPConnection")
    def test_private_configured_origin_is_pinned_and_preserved(
        self, connection_type, _resolved
    ):
        response = Mock(status=200)
        response.getheader.return_value = None
        response.read.return_value = b"ok"
        response.getheaders.return_value = []
        connection_type.return_value.getresponse.return_value = response
        origin = validated_origin("http://storage.internal:8080")

        result = request(
            "GET", "http://storage.internal:8080/object", origin=origin
        )

        self.assertEqual(result.body, b"ok")
        connection_type.assert_called_once_with(
            "storage.internal", 8080, "10.2.3.4", 10
        )
        headers = connection_type.return_value.request.call_args.kwargs["headers"]
        self.assertEqual(headers["Host"], "storage.internal:8080")


if __name__ == "__main__":
    unittest.main()