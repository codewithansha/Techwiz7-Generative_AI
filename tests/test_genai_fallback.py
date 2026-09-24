from types import SimpleNamespace

from genai_pipeline.client import provider_chain


def _settings(**kwargs):
    defaults = {
        "genai_provider": "openai",
        "genai_fallback_list": ["grok", "cursor"],
        "openai_api_key": "",
        "gemini_api_key": "",
        "anthropic_api_key": "",
        "grok_api_key": "",
        "xai_api_key": "",
        "cursor_api_key": "",
        "grok_key": "",
    }
    defaults.update(kwargs)
    defaults["grok_key"] = defaults["grok_api_key"] or defaults["xai_api_key"]

    def provider_has_key(name: str) -> bool:
        mapping = {
            "openai": bool(defaults["openai_api_key"]),
            "gemini": bool(defaults["gemini_api_key"]),
            "anthropic": bool(defaults["anthropic_api_key"]),
            "grok": bool(defaults["grok_key"]),
            "xai": bool(defaults["grok_key"]),
            "cursor": bool(defaults["cursor_api_key"]),
        }
        return mapping.get(name, False)

    return SimpleNamespace(**defaults, provider_has_key=provider_has_key)


def test_fallback_order_is_primary_then_grok_then_cursor():
    settings = _settings(openai_api_key="o", grok_api_key="g", cursor_api_key="c")
    assert provider_chain(settings) == ["openai", "grok", "cursor"]


def test_xai_alias_enables_grok_fallback():
    settings = _settings(gemini_api_key="gm", xai_api_key="x", genai_provider="gemini")
    assert provider_chain(settings) == ["gemini", "grok"]


def test_missing_keys_are_skipped():
    settings = _settings(cursor_api_key="c", genai_provider="openai")
    assert provider_chain(settings) == ["cursor"]
