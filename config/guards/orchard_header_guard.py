"""Validate the direct client's headers locally without logging values or changing model requests."""
import hmac
import json
import os
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import h11
import httpx
from litellm.llms.deepseek.chat.transformation import DeepSeekChatConfig
from wire_history import ENDPOINT, WitnessedDeepSeek

TOKEN_NAME = re.compile(rb"[!#$%&'*+.^_`|~0-9A-Za-z-]+")
PREFLIGHT = Path("/logs/agent/orchard-header-preflight.json")


class HeaderFormatError(ValueError):
    """Fixed codes only. Never include the supplied name, value, or a credential digest."""


def checked_key():
    value = os.environ.get("DEEPSEEK_API_KEY", "")
    if not value or not value.isascii() or not value.isprintable() or any(c.isspace() for c in value):
        raise HeaderFormatError("container_credential_format")
    return value


def ascii_field(value, code):
    if isinstance(value, str) and value.isascii():
        return value.encode("ascii")
    if isinstance(value, bytes) and value.isascii():
        return value
    raise HeaderFormatError(code)


def check_fields(headers):
    if isinstance(headers, httpx.Headers):
        items = headers.raw
    elif isinstance(headers, dict):
        items = headers.items()
    else:
        items = headers or ()
    for name, value in items:
        name = ascii_field(name, "request_header_name_format")
        if TOKEN_NAME.fullmatch(name) is None:
            raise HeaderFormatError("request_header_name_format")
        code = "authorization_header_format" if name.lower() == b"authorization" else "other_header_format"
        raw = ascii_field(value, code)
        if raw != raw.strip(b" \t") or any((c < 32 and c != 9) or c == 127 for c in raw):
            raise HeaderFormatError(code)


def check_serialized(request):
    if request.method != "POST" or str(request.url) != ENDPOINT:
        raise HeaderFormatError("direct_endpoint_changed")
    raw = request.headers.raw
    check_fields(request.headers)
    authorizations = [v for k, v in raw if k.lower() == b"authorization"]
    expected = b"Bearer " + checked_key().encode("ascii")
    if len(authorizations) != 1 or not hmac.compare_digest(authorizations[0], expected):
        raise HeaderFormatError("authorization_does_not_match_container_input")
    try:
        # Use the installed HTTP/1.1 encoder's own checks in memory. This creates no socket.
        h11.Request(method=b"POST", target=request.url.raw_path, headers=raw)
    except (ValueError, h11.LocalProtocolError):
        raise HeaderFormatError("http11_serialization_rejected") from None


class HeaderCheckedDeepSeek(WitnessedDeepSeek):
    def build_handler(self):
        handler = super().build_handler()
        original = handler.client.build_request

        def build(*args, **kwargs):
            try:
                check_fields(kwargs.get("headers"))
                return original(*args, **kwargs)
            except HeaderFormatError as err:
                self.stop(str(err))
            except UnicodeError:
                self.stop("client_request_build_encoding")
        handler.client.build_request = build
        return handler

    def before_send(self, request):
        try:
            check_serialized(request)
        except HeaderFormatError as err:
            self.stop(str(err))
        # This is the actual fully assembled request. The parent verifies the untouched
        # body, original tool, route, spend and count, and only then logs the wire attempt.
        self._event("final_headers_ok", sequence=self.transport_count+1)
        super().before_send(request)


def container_dry_build():
    import socket
    from unittest.mock import patch
    connections = []
    def forbid(*args, **kwargs):
        connections.append(True)
        raise HeaderFormatError("network_used_during_dry_build")
    with patch.object(socket.socket, "connect", forbid), patch.object(socket.socket, "connect_ex", forbid), \
         patch.object(socket, "getaddrinfo", forbid), patch.object(socket, "create_connection", forbid):
        config = DeepSeekChatConfig()
        headers = config.validate_environment({}, "deepseek-flash", [], {}, {}, api_key=checked_key())
        check_fields(headers)
        handler = WitnessedDeepSeek.build_handler()
        try:
            request = handler.client.build_request("POST", ENDPOINT, headers=headers, json={})
            check_serialized(request)
        finally:
            handler.client.close()
    if connections:
        raise HeaderFormatError("network_used_during_dry_build")
    return {"direct_provider_header_factory": True, "credential_bytes_unchanged": True,
            "httpx_build_and_h11_validation": True, "socket_connections": 0, "model_requests": 0}


if __name__ == "__main__":
    try:
        result = container_dry_build()
    except HeaderFormatError as err:
        print(str(err), file=sys.stderr)
        raise SystemExit(2)
    except Exception:
        print("offline_container_header_check_unavailable", file=sys.stderr)
        raise SystemExit(2) from None
    # The real job writes one value-free receipt; the separate offline fixture does not.
    if sys.argv[1:] == ["--actual-container"]:
        with PREFLIGHT.open("x", encoding="utf-8") as f:
            json.dump(result, f)
    elif sys.argv[1:]:
        raise SystemExit(2)
    print("CONTAINER_HEADER_DRY_BUILD_OK")
