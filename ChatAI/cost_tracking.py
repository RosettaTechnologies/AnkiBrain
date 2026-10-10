"""Provider-agnostic session cost tracking for the ChatAI subprocess.

langchain's `get_openai_callback` prices only the model ids in OpenAI's own
table, so every OpenAI-compatible endpoint AnkiBrain supports (OpenAI itself,
opencode Zen/Go, OpenRouter, Groq, a local server) reported $0.00. Cost is now
resolved per request, in order:

1. a price the user set in Settings (`openaiInputCostPer1M` /
   `openaiOutputCostPer1M`, USD per 1M tokens) — the override wins outright;
2. the cost the endpoint reports in the response `usage` (OpenRouter and other
   gateways return `usage.cost`; OpenAI and Groq never do);
3. a built-in price for the models AnkiBrain ships, then langchain's OpenAI
   table for any other id it knows;
4. otherwise 0: the tracker under-reports rather than inventing a number.
"""
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Optional
import re

from langchain_community.callbacks.openai_info import (
    TokenType,
    get_openai_token_cost_for_model,
)
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult
from langchain_core.tracers.context import register_configure_hook

from llm_config import get_cost_prices

# Per-request cost keys endpoints use. OpenRouter and its clones report `cost`;
# a few gateways use a longer name.
_REPORTED_COST_KEYS = ('cost', 'total_cost', 'cost_usd')

# AnkiBrain's recommended models at OpenAI's published standard rates (USD per
# 1M tokens: input, output). OpenAI resells them under the same ids and never
# reports a cost, so without this the shipped default would always read $0.00.
# Zen resells the same models at the same rates, so this is right for both.
_SHIPPED_PRICES_PER_1M = {
    'gpt-5.6-sol': (4.00, 20.00),
    'gpt-5.6-terra': (2.00, 12.00),
    'gpt-5.6-luna': (0.20, 1.20),
}


def _as_number(value: Any) -> Optional[float]:
    """A finite float for a numeric value, else None (bool is not a number)."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _raw_usage(response: LLMResult) -> dict:
    """The provider's raw `usage` object for a finished run, or {}."""
    # ChatOpenAI stores the endpoint's parsed `usage` verbatim here, so any
    # extra field it returned (e.g. `cost`) survives.
    usage = (response.llm_output or {}).get('token_usage')
    if isinstance(usage, dict):
        return usage
    # Fall back to the normalized usage_metadata attached to the message.
    try:
        message = response.generations[0][0].message
    except (IndexError, AttributeError):
        return {}
    meta = getattr(message, 'usage_metadata', None)
    if not isinstance(meta, dict):
        return {}
    return {
        'prompt_tokens': meta.get('input_tokens'),
        'completion_tokens': meta.get('output_tokens'),
        'total_tokens': meta.get('total_tokens'),
    }


def _reported_cost(usage: dict) -> Optional[float]:
    for key in _REPORTED_COST_KEYS:
        value = _as_number(usage.get(key))
        if value is not None:
            return value
    # OpenRouter also nests an `upstream_inference_cost` under cost_details;
    # the top-level `cost` above is the amount actually charged.
    details = usage.get('cost_details')
    if isinstance(details, dict):
        for key in _REPORTED_COST_KEYS:
            value = _as_number(details.get(key))
            if value is not None:
                return value
    return None


def _model_name(response: LLMResult) -> str:
    """The id the endpoint actually served, or ''."""
    name = (response.llm_output or {}).get('model_name')
    if isinstance(name, str) and name:
        return name
    try:
        meta = response.generations[0][0].message.response_metadata
    except (IndexError, AttributeError):
        return ''
    name = meta.get('model_name') if isinstance(meta, dict) else None
    return name if isinstance(name, str) else ''


def _table_cost(model_name: str, prompt: float, completion: float) -> Optional[float]:
    """Cost from a price table, or None when the model is not priced anywhere."""
    if not model_name:
        return None
    # A dated id (gpt-5.6-luna-2026-05-01) prices as its base model.
    base = re.sub(r'-\d{4}-\d{2}-\d{2}$', '', model_name.strip().lower())
    prices = _SHIPPED_PRICES_PER_1M.get(base)
    if prices is not None:
        return prompt / 1e6 * prices[0] + completion / 1e6 * prices[1]
    # Anything else langchain's OpenAI table knows (gpt-4o, gpt-5, ...); it
    # raises for ids it does not.
    try:
        return (
            get_openai_token_cost_for_model(
                model_name, int(prompt), token_type=TokenType.PROMPT
            )
            + get_openai_token_cost_for_model(
                model_name, int(completion), token_type=TokenType.COMPLETION
            )
        )
    except ValueError:
        return None


class CostTracker(BaseCallbackHandler):
    """Accumulates the session's spend across every LLM call in this process."""

    def __init__(self) -> None:
        self.total_cost = 0.0
        self.total_tokens = 0
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.successful_requests = 0

    def on_llm_end(self, response: LLMResult, **kwargs: Any) -> None:
        usage = _raw_usage(response)
        prompt = _as_number(usage.get('prompt_tokens')) or 0.0
        completion = _as_number(usage.get('completion_tokens')) or 0.0
        total = _as_number(usage.get('total_tokens'))
        if total is None:
            total = prompt + completion

        input_price, output_price = get_cost_prices()
        if input_price or output_price:
            # A configured price wins: the provider may report no cost at all.
            cost = prompt / 1e6 * input_price + completion / 1e6 * output_price
        else:
            reported = _reported_cost(usage)
            if reported is not None:
                cost = reported
            else:
                cost = _table_cost(_model_name(response), prompt, completion) or 0.0

        self.total_cost += cost
        self.prompt_tokens += int(prompt)
        self.completion_tokens += int(completion)
        self.total_tokens += int(total)
        self.successful_requests += 1


cost_callback_var: ContextVar[Optional[CostTracker]] = ContextVar(
    'ankibrain_cost_callback', default=None
)
# Same wiring langchain's own `get_openai_callback` uses: every run picks up
# the handler from the context variable while it is set.
register_configure_hook(cost_callback_var, True)


@contextmanager
def get_cost_tracker():
    """Set the session CostTracker for the duration of the block."""
    cb = CostTracker()
    cost_callback_var.set(cb)
    try:
        yield cb
    finally:
        cost_callback_var.set(None)
