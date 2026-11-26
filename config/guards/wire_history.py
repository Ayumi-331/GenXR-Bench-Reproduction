"""For the preregistered first-attempt cohort. Check the original provider JSON and the actual outgoing body."""
from dataclasses import dataclass
from decimal import Decimal
import hashlib
import json
import time

import httpx
from litellm.llms.custom_httpx.http_handler import HTTPHandler
from minisweagent.models.litellm_model import BASH_TOOL, LitellmModel

from strict_history import RecordedDeepSeek

ENDPOINT = "https://api.deepseek.com/chat/completions"
MAX_REQUESTS = 128
BUDGET = Decimal("1.4938944")
ONE_IN_FLIGHT = Decimal("0.3538944")
PRE_CALL_LIMIT = BUDGET - ONE_IN_FLIGHT


class ContinuityError(RuntimeError):
    """Fixed diagnostic codes only; never include a key or private message."""


def state(message):
    if "reasoning_content" not in message:
        return "missing"
    value = message["reasoning_content"]
    if value is None:
        return "null"
    if not isinstance(value, str):
        return "wrong_type"
    return "empty" if value == "" else "text"


def digest(value):
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def calls(message):
    return [(t["id"], t["type"], t["function"]["name"], t["function"]["arguments"])
            for t in message.get("tool_calls") or []]


def conversation_digest(messages):
    return digest([(m["role"], m.get("content"), calls(m), m.get("tool_call_id")) for m in messages])


@dataclass(frozen=True)
class Original:
    value: str
    call_identity: str
    response_id: str


class WitnessedDeepSeek(RecordedDeepSeek):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.originals = []
        self.expected = None
        self.sent_prefix = None
        self.sent_prefix_length = 0
        self.original = None
        self.transport_count = 0
        self.sent_this_query = False
        self.transport = self.build_handler()
        self.transport.client.event_hooks["request"].append(self.before_send)
        self.transport.client.event_hooks["response"].append(self.on_response)

    @staticmethod
    def build_handler():
        # Preserve the installed client's TLS and proxy routing. Inspect its chosen connection pool
        # before use because retries below an HTTP event hook would not be counted.
        handler = HTTPHandler(timeout=240, follow_redirects=False)
        transport = handler.client._transport_for_url(httpx.URL(ENDPOINT))
        if getattr(getattr(transport, "_pool", None), "_retries", None) != 0:
            handler.client.close()
            raise ContinuityError("unverified_connection_retry_setting")
        return handler

    def stop(self, code):
        self.failed = True
        self._event("continuity_stop", reason=code)
        raise ContinuityError(code)

    def check_history(self, messages):
        prior = [m for m in messages if m.get("role") == "assistant"]
        if len(prior) != len(self.originals):
            self.stop("unwitnessed_or_truncated_history")
        pending = []
        for m in messages:
            role = m["role"]
            if role == "tool":
                if not pending or m.get("tool_call_id") != pending.pop(0):
                    self.stop("tool_result_id_or_order_changed")
            elif pending:
                self.stop("incomplete_tool_results")
            elif role == "assistant":
                pending = [c[0] for c in calls(m)]
                if len(pending) != len(set(pending)):
                    self.stop("duplicate_tool_id_within_turn")
        if pending:
            self.stop("incomplete_tool_results")
        for assistant, orig in zip(prior, self.originals, strict=True):
            if state(assistant) not in ("empty", "text") or assistant["reasoning_content"] != orig.value:
                self.stop("reasoning_changed_or_lost")
            if digest(calls(assistant)) != orig.call_identity:
                self.stop("assistant_tool_definition_changed")

    def _prepare_messages_for_api(self, messages):
        if self.failed:
            raise ContinuityError("previous_error")
        self.check_history(messages)
        if self.sent_prefix is not None and conversation_digest(messages[:self.sent_prefix_length]) != self.sent_prefix:
            self.stop("previously_sent_messages_changed")
        # mini still handles its own extra fields, cache policy and tool formatting.
        self.expected = conversation_digest(messages)
        return LitellmModel._prepare_messages_for_api(self, messages)

    def before_send(self, request):
        if self.failed or self.sent_this_query or self.transport_count >= MAX_REQUESTS:
            self.stop("request_or_retry_limit")
        if request.method != "POST" or str(request.url) != ENDPOINT:
            self.stop("route_changed")
        body = json.loads(request.content)
        if (body.get("model") != "deepseek-flash" or body.get("thinking") != {"type": "enabled"}
                or body.get("reasoning_effort") != "xhigh" or body.get("max_tokens") != 32768
                or body.get("tools") != [BASH_TOOL] or body.get("stream")):
            self.stop("model_configuration_changed")
        history = body["messages"]
        self.check_history(history)
        if conversation_digest(history) != self.expected:
            self.stop("serialized_messages_or_results_changed")
        self.sent_this_query = True
        self.sent_prefix, self.sent_prefix_length = self.expected, len(history)
        self.transport_count += 1
        self.sent_at = time.monotonic()
        self._event("http_attempt", sequence=self.transport_count, history_sha256=self.expected,
                    assistant_turns=len(self.originals))

    def on_response(self, response):
        self._event("http_status", sequence=self.transport_count, status=response.status_code,
                    elapsed_s=round(time.monotonic() - self.sent_at, 3))
        if response.status_code != 200:
            self.failed = True
            return
        # Non-streaming route only. HTTPX returns the buffered bytes to LiteLLM after this hook.
        payload = json.loads(response.read())
        choice, = payload["choices"]
        msg = choice["message"]
        kind = state(msg)
        self._event("original_http_field", kind=kind, response_id_sha256=digest(payload["id"]),
                    reasoning_sha256=digest(msg["reasoning_content"]) if kind in ("empty", "text") else None,
                    tool_identity_sha256=digest(calls(msg)))
        self.raw_kind = kind
        if kind in ("empty", "text"):
            self.original = Original(msg["reasoning_content"], digest(calls(msg)), payload["id"])

    def _query(self, messages, **kwargs):
        if self.failed or self.attempts >= MAX_REQUESTS or self.peak_cost >= PRE_CALL_LIMIT:
            self.stop("count_cost_or_previous_error")
        self.original = None
        self.raw_kind = "no_witness"
        self.sent_this_query = False
        try:
            response = super()._query(messages, client=self.transport, **kwargs)
            msg = response.choices[0].message.model_dump()
            if self.original is None:
                self.stop("original_field_" + self.raw_kind)
            original = self.original
            if response.id != original.response_id or digest(calls(msg)) != original.call_identity:
                self.stop("converted_response_identity_changed")
            if state(msg) not in ("empty", "text") or msg["reasoning_content"] != original.value:
                self.stop("conversion_changed_original")
            self.originals.append(original)
            return response
        except Exception:
            self.failed = True
            raise
