from __future__ import annotations

import re
import time
from typing import Any

import httpx

from config.settings import CHAT_PROVIDERS, Settings, get_settings
from python_validation.schema import extract_json

# Retrying these buys nothing: the key, route, or permission is wrong until a human fixes it.
PERMANENT_STATUS = {400, 401, 403, 404, 405}


class GenAIError(RuntimeError):
    def __init__(self, message: str, *, permanent: bool = False) -> None:
        super().__init__(message)
        self.permanent = permanent


def provider_chain(settings: Settings | None = None) -> list[str]:
    settings = settings or get_settings()
    names = [settings.genai_provider.lower(), *settings.genai_fallback_list]
    if getattr(settings, "genai_auto_fallback", True):
        names.extend(CHAT_PROVIDERS)
    ordered: list[str] = []
    for name in names:
        alias = "grok" if name == "xai" else name
        if alias not in ordered and settings.provider_has_key(alias):
            ordered.append(alias)
    return ordered


def generate_structured(system_prompt: str, user_prompt: str) -> dict[str, Any]:
    settings = get_settings()
    chain = provider_chain(settings)
    if not chain:
        raise GenAIError("No GenAI provider API key is configured.")

    errors: list[str] = []
    for provider in chain:
        provider_error = "unknown error"
        for attempt in range(1, settings.genai_max_retries + 1):
            started = time.perf_counter()
            try:
                raw = _dispatch(provider, system_prompt, user_prompt, settings)
                parsed = extract_json(raw)
                return {
                    "raw": raw,
                    "structured": parsed,
                    "attempt": attempt,
                    "latency_ms": int((time.perf_counter() - started) * 1000),
                    "provider": provider,
                    "model": _model_name(provider, settings),
                    "error": "",
                    "fallback_used": provider != chain[0],
                    "providers_tried": chain[: chain.index(provider) + 1],
                }
            except GenAIError as exc:
                provider_error = str(exc)
                if exc.permanent:
                    break
            except Exception as exc:  # noqa: BLE001 — retry this provider, then fall back
                provider_error = str(exc)
            if attempt < settings.genai_max_retries:
                time.sleep(min(1.5 * attempt, 3))
        errors.append(f"{provider}: {provider_error}")
    raise GenAIError("All GenAI providers failed — " + " | ".join(errors))


def _model_name(provider: str, settings: Settings) -> str:
    return {
        "gemini": settings.gemini_model,
        "anthropic": settings.anthropic_model,
        "grok": settings.grok_model,
        "xai": settings.grok_model,
        "openai": settings.openai_model,
    }.get(provider, settings.openai_model)


def _dispatch(provider: str, system_prompt: str, user_prompt: str, settings: Settings) -> str:
    if provider == "gemini":
        return _gemini(system_prompt, user_prompt, settings)
    if provider == "anthropic":
        return _anthropic(system_prompt, user_prompt, settings)
    if provider in {"grok", "xai"}:
        return _grok(system_prompt, user_prompt, settings)
    return _openai(system_prompt, user_prompt, settings)


def _openai_compatible(
    *,
    url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    timeout: int,
    extra_headers: dict[str, str] | None = None,
    json_mode: bool = True,
) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        **(extra_headers or {}),
    }
    body: dict[str, Any] = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    with httpx.Client(timeout=timeout) as client:
        response = client.post(url, headers=headers, json=body)
        # Only drop JSON mode when the model actually rejected response_format; retrying
        # blindly on every 4xx hid the real cause (bad key, missing route) behind a second failure.
        if json_mode and response.status_code == 400 and "response_format" in response.text:
            return _openai_compatible(
                url=url,
                api_key=api_key,
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                timeout=timeout,
                extra_headers=extra_headers,
                json_mode=False,
            )
        if response.status_code >= 400:
            raise GenAIError(_http_error(response), permanent=_is_permanent(response))
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        if isinstance(content, list):
            return "".join(part.get("text", "") for part in content if isinstance(part, dict))
        return content or ""


def _http_error(response: httpx.Response) -> str:
    # The URL can carry the API key as a query param; this message is persisted on the
    # GenAIRun row and shown to reviewers, so it must never leak a credential.
    url = re.sub(r"(key|api_key|access_token)=[^&]+", r"\1=REDACTED", str(response.request.url))
    return f"HTTP {response.status_code} {url}: {response.text[:500]}"


def _is_permanent(response: httpx.Response) -> bool:
    if response.status_code in PERMANENT_STATUS:
        return True
    # A 429 is normally worth retrying, but an exhausted balance will not refill mid-run.
    return response.status_code == 429 and any(
        marker in response.text.lower()
        for marker in ("insufficient_quota", "credit_balance_exhausted", "billing", "no credits")
    )


def _openai(system_prompt: str, user_prompt: str, settings: Settings) -> str:
    if not settings.openai_api_key:
        raise GenAIError("OPENAI_API_KEY is not configured.")
    return _openai_compatible(
        url="https://api.openai.com/v1/chat/completions",
        api_key=settings.openai_api_key,
        model=settings.openai_model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        timeout=settings.genai_timeout_seconds,
    )


def _grok(system_prompt: str, user_prompt: str, settings: Settings) -> str:
    key = settings.grok_key
    if not key:
        raise GenAIError("GROK_API_KEY / XAI_API_KEY is not configured.")
    return _openai_compatible(
        url="https://api.x.ai/v1/chat/completions",
        api_key=key,
        model=settings.grok_model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        timeout=settings.genai_timeout_seconds,
    )


def _gemini(system_prompt: str, user_prompt: str, settings: Settings) -> str:
    if not settings.gemini_api_key:
        raise GenAIError("GEMINI_API_KEY is not configured.")
    # Key travels as a header, not a query param, so it cannot leak through error text or logs.
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
    headers = {"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"}
    body = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }
    with httpx.Client(timeout=settings.genai_timeout_seconds) as client:
        response = client.post(url, headers=headers, json=body)
        if response.status_code >= 400:
            raise GenAIError(_http_error(response), permanent=_is_permanent(response))
        data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


def _anthropic(system_prompt: str, user_prompt: str, settings: Settings) -> str:
    if not settings.anthropic_api_key:
        raise GenAIError("ANTHROPIC_API_KEY is not configured.")
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": settings.anthropic_model,
        "max_tokens": 2000,
        "temperature": 0.2,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    with httpx.Client(timeout=settings.genai_timeout_seconds) as client:
        response = client.post("https://api.anthropic.com/v1/messages", headers=headers, json=body)
        if response.status_code >= 400:
            raise GenAIError(_http_error(response), permanent=_is_permanent(response))
        data = response.json()
        return "".join(part.get("text", "") for part in data.get("content", []))
