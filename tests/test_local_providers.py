"""Groq and Ollama fallbacks, and tolerant enum formatting for smaller models."""

import httpx
import pytest

from config.settings import Settings
from genai_pipeline import client
from python_validation.schema import coerce_enums


def _settings(**overrides) -> Settings:
    base = {"openai_api_key": "", "gemini_api_key": "", "anthropic_api_key": "", "grok_api_key": "", "xai_api_key": "", "groq_api_key": "", "ollama_enabled": False}
    return Settings(_env_file=None, **{**base, **overrides})


def test_groq_and_ollama_join_the_chain_only_when_configured():
    assert client.provider_chain(_settings()) == []
    chain = client.provider_chain(_settings(openai_api_key="k", groq_api_key="g", ollama_enabled=True, genai_fallback_providers="groq,ollama"))
    assert chain == ["openai", "groq", "ollama"]
    assert "ollama" not in client.provider_chain(_settings(groq_api_key="g"))


def test_ollama_uses_the_openai_compatible_endpoint(monkeypatch):
    seen = {}

    def fake(**kwargs):
        seen.update(kwargs)
        return '{"ok": true}'

    monkeypatch.setattr(client, "_openai_compatible", fake)
    settings = _settings(ollama_enabled=True, ollama_base_url="http://ollama:11434/", ollama_model="qwen2.5:3b")
    assert client._dispatch("ollama", "sys", "user", settings, 5) == '{"ok": true}'
    assert seen["url"] == "http://ollama:11434/v1/chat/completions" and seen["model"] == "qwen2.5:3b"


def test_unreachable_ollama_is_a_permanent_error(monkeypatch):
    def refuse(**kwargs):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(client, "_openai_compatible", refuse)
    with pytest.raises(client.GenAIError) as exc:
        client._dispatch("ollama", "s", "u", _settings(ollama_enabled=True), 5)
    assert exc.value.permanent and "not reachable" in str(exc.value)


def test_groq_calls_groq_not_xai(monkeypatch):
    seen = {}
    monkeypatch.setattr(client, "_openai_compatible", lambda **k: seen.update(k) or "{}")
    client._dispatch("groq", "s", "u", _settings(groq_api_key="gsk_x"), 5)
    assert seen["url"].startswith("https://api.groq.com/") and seen["api_key"] == "gsk_x"


@pytest.mark.parametrize(
    "raw, expected",
    [
        ({"priority": "P1 (HIGH)"}, {"priority": "P1"}),
        ({"priority": "P1 or P2"}, {"priority": "P1 OR P2"}),  # ambiguous: left for the schema to reject
        ({"urgency": "High (P1)"}, {"urgency": "high"}),
        ({"urgency": "super-high"}, {"urgency": "super_high"}),
        ({"urgency": "high/critical"}, {"urgency": "high/critical"}),
        ({"compensation_recommended": None}, {"compensation_recommended": False}),
    ],
)
def test_coerce_enums_repairs_annotated_values_only(raw, expected):
    assert coerce_enums(raw) == expected
