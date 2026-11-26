"""Check continuity and write a usage receipt inside mini. All model traffic still uses the stock direct LiteLLM client."""
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import time
from minisweagent.models.litellm_model import LitellmModel

class RecordedDeepSeek(LitellmModel):
    receipt=Path("/logs/agent/deepseek-requests.jsonl")
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.attempts=0
        self.peak_cost=Decimal(0)
        self.failed=False

    def _event(self, event, **values):
        with self.receipt.open("a",encoding="utf-8") as f:
            f.write(json.dumps({"event":event,"time_utc":datetime.now(timezone.utc).isoformat(),"attempt":self.attempts,**values})+"\n")

    def _prepare_messages_for_api(self, messages):
        for m in messages:
            if m.get("role")!="assistant":continue
            native=m.get("reasoning_content") or (m.get("provider_specific_fields") or {}).get("reasoning_content")
            if not isinstance(native,str) or not native.strip():
                self.failed=True
                self._event("stop_missing_original_reasoning")
                raise ValueError("Original reasoning unavailable; stopped before the next HTTP request.")
        return super()._prepare_messages_for_api(messages)

    def _query(self, messages, **kwargs):
        if self.failed or self.attempts>=128 or self.peak_cost>=Decimal("1.14"):
            raise RuntimeError("The single generation reached its stop condition.")
        self.attempts+=1
        self._event("direct_client_attempt")
        start=time.monotonic()
        try:
            response=super()._query(messages,**kwargs)
            usage=response.usage.model_dump()
            inputs,outputs=usage["prompt_tokens"],usage["completion_tokens"]
            hits=usage.get("prompt_cache_hit_tokens")
            if hits is None: hits=(usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0
            if not all(type(i) is int for i in (inputs,outputs,hits)) or not (0<=hits<=inputs<=1048576 and 0<=outputs<=32768) or inputs+outputs==0:
                raise ValueError("Unexpected usage; stopped before another request.")
            if response.model not in ("deepseek-flash","DeepSeek-V4.1-Flash-1017"):
                raise ValueError("Unexpected response model; stopped before another request.")
            charge=(Decimal("0.006")*hits+Decimal("0.30")*(inputs-hits)+Decimal("1.20")*outputs)/1000000
            self.peak_cost+=charge
            self._event("received",reply_model=response.model,response_id_sha256=hashlib.sha256(response.id.encode()).hexdigest(),elapsed_s=round(time.monotonic()-start,3),input_tokens=inputs,cache_hit_tokens=hits,output_tokens=outputs,peak_usd=str(charge),peak_cumulative_usd=str(self.peak_cost))
            return response
        except Exception as err:
            self.failed=True
            status=getattr(err,"status_code",None)
            self._event("stopped",error_type=type(err).__name__,http_status=status if isinstance(status,int) else None,elapsed_s=round(time.monotonic()-start,3))
            raise
