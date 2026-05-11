"""Async LLM client with prompt caching and structured output."""
from __future__ import annotations

import ast
import json
import os
import pathlib
import time
from typing import Any, TypeVar

from anthropic import AsyncAnthropic
from pydantic import BaseModel, ValidationError


def _coerce_json_strings(obj: Any) -> Any:
    if isinstance(obj, str):
        s = obj.strip()
        if (s.startswith("[") and s.endswith("]")) or (s.startswith("{") and s.endswith("}")):
            for parser in (json.loads, ast.literal_eval):
                try:
                    return _coerce_json_strings(parser(s))
                except Exception:
                    continue
            return obj
        return obj
    if isinstance(obj, list):
        return [_coerce_json_strings(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _coerce_json_strings(v) for k, v in obj.items()}
    return obj


T = TypeVar("T", bound=BaseModel)

DEFAULT_MODEL_FAST = os.environ.get("ANTHROPIC_MODEL_FAST", "claude-sonnet-4-6")
DEFAULT_MODEL_SMART = os.environ.get("ANTHROPIC_MODEL_SMART", "claude-sonnet-4-6")


class LLMClient:
    def __init__(self, lesson_text: str, iep_text: str, api_key: str | None = None):
        self.client = AsyncAnthropic(api_key=api_key or os.environ.get("ANTHROPIC_API_KEY"))
        self.lesson_text = lesson_text
        self.iep_text = iep_text
        self.timings_ms: dict[str, int] = {}
        self.cache_metrics: dict[str, int] = {"cache_creation": 0, "cache_read": 0, "input": 0, "output": 0}

    def _cached_system(self, role_preamble: str) -> list[dict[str, Any]]:
        # Cacheable docs first; per-call preamble last so it doesn't bust the cache key.
        return [
            {
                "type": "text",
                "text": f"<lesson_document>\n{self.lesson_text}\n</lesson_document>",
            },
            {
                "type": "text",
                "text": f"<iep_document>\n{self.iep_text}\n</iep_document>",
                "cache_control": {"type": "ephemeral"},
            },
            {"type": "text", "text": role_preamble},
        ]

    def _track_usage(self, usage: Any) -> None:
        if not usage:
            return
        self.cache_metrics["cache_creation"] += getattr(usage, "cache_creation_input_tokens", 0) or 0
        self.cache_metrics["cache_read"] += getattr(usage, "cache_read_input_tokens", 0) or 0
        self.cache_metrics["input"] += getattr(usage, "input_tokens", 0) or 0
        self.cache_metrics["output"] += getattr(usage, "output_tokens", 0) or 0

    async def extract_structured(
        self,
        *,
        step_name: str,
        output_model: type[T],
        role_preamble: str,
        instructions: str,
        model: str | None = None,
        max_tokens: int = 8192,
        thinking: bool = False,
    ) -> T:
        chosen_model = model or DEFAULT_MODEL_FAST
        tool = {
            "name": "submit",
            "description": f"Submit the {output_model.__name__} object.",
            "input_schema": output_model.model_json_schema(),
        }

        kwargs: dict[str, Any] = dict(
            model=chosen_model,
            max_tokens=max_tokens,
            system=self._cached_system(role_preamble),
            tools=[tool],
            tool_choice={"type": "tool", "name": "submit"},
            messages=[{"role": "user", "content": instructions}],
        )
        if thinking:
            kwargs["thinking"] = {"type": "enabled", "budget_tokens": 4000}
            kwargs.pop("tool_choice", None)

        t0 = time.perf_counter()
        resp = await self.client.messages.create(**kwargs)
        self.timings_ms[step_name] = int((time.perf_counter() - t0) * 1000)
        self._track_usage(getattr(resp, "usage", None))

        for block in resp.content:
            if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "submit":
                raw = block.input
                try:
                    return output_model.model_validate(raw)
                except ValidationError:
                    coerced = _coerce_json_strings(raw)
                    try:
                        return output_model.model_validate(coerced)
                    except ValidationError as e2:
                        dump = pathlib.Path(".debug")
                        dump.mkdir(exist_ok=True)
                        path = dump / f"{step_name}.json"
                        path.write_text(json.dumps(coerced, indent=2, default=str))
                        raise RuntimeError(f"[{step_name}] validation failed; payload dumped to {path}\n{e2}") from e2
        raise RuntimeError(f"[{step_name}] model did not call submit tool. stop_reason={resp.stop_reason}")

    async def extract_structured_text(
        self,
        *,
        step_name: str,
        output_model: type[T],
        role_preamble: str,
        instructions: str,
        model: str | None = None,
        max_tokens: int = 8192,
    ) -> T:
        # Text-mode JSON path: more reliable than tool-use for deeply-nested schemas
        # where tool-use sometimes stringifies inner list fields.
        chosen_model = model or DEFAULT_MODEL_FAST
        schema_json = json.dumps(output_model.model_json_schema(), indent=2)
        full_instructions = (
            instructions
            + "\n\n# Output format\n"
            + "Reply with EXACTLY one JSON object matching the schema below. "
            + "No prose before or after. No markdown code fences. Start with `{` and end with `}`.\n\n"
            + f"Schema:\n{schema_json}"
        )

        t0 = time.perf_counter()
        resp = await self.client.messages.create(
            model=chosen_model,
            max_tokens=max_tokens,
            system=self._cached_system(role_preamble),
            messages=[{"role": "user", "content": full_instructions}],
        )
        self.timings_ms[step_name] = int((time.perf_counter() - t0) * 1000)
        self._track_usage(getattr(resp, "usage", None))

        text = ""
        for block in resp.content:
            if getattr(block, "type", None) == "text":
                text += block.text

        first = text.find("{")
        last = text.rfind("}")
        if first == -1 or last == -1 or last < first:
            raise RuntimeError(f"[{step_name}] no JSON object in response. text head: {text[:300]!r}")
        candidate = text[first : last + 1]

        try:
            data = json.loads(candidate)
        except json.JSONDecodeError as e:
            dump = pathlib.Path(".debug")
            dump.mkdir(exist_ok=True)
            (dump / f"{step_name}.txt").write_text(candidate)
            raise RuntimeError(f"[{step_name}] could not parse JSON; raw dumped\n{e}") from e

        try:
            return output_model.model_validate(data)
        except ValidationError:
            return output_model.model_validate(_coerce_json_strings(data))

    async def complete_text(
        self,
        *,
        step_name: str,
        role_preamble: str,
        instructions: str,
        model: str | None = None,
        max_tokens: int = 2048,
    ) -> str:
        chosen_model = model or DEFAULT_MODEL_FAST
        t0 = time.perf_counter()
        resp = await self.client.messages.create(
            model=chosen_model,
            max_tokens=max_tokens,
            system=self._cached_system(role_preamble),
            messages=[{"role": "user", "content": instructions}],
        )
        self.timings_ms[step_name] = int((time.perf_counter() - t0) * 1000)
        self._track_usage(getattr(resp, "usage", None))
        out = []
        for block in resp.content:
            if getattr(block, "type", None) == "text":
                out.append(block.text)
        return "\n".join(out).strip()
