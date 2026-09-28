"""Tests for SupportNova Multilingual AI Intelligence layer."""

from src.services.multilingual import (
    SUPPORTED_LANGUAGES,
    detect_language,
    preserve_terminology,
    restore_terminology,
    translate_for_agent,
    translate_for_customer,
    translate_message,
)


def test_language_detection_english():
    det = detect_language("My order has not arrived yet. Please check.")
    assert det.code == "en"
    assert det.confidence >= 0.90


def test_language_detection_roman_urdu():
    cases = [
        "mera order abhi tak nahi aya",
        "mera order abhi tk nhi aya",
        "bhai mera paisa kab wapis ayega",
        "mera account login nhi horaha",
        "mujhy refund kab milega",
        "kya mera package ship ho gaya hai?",
    ]
    for case in cases:
        det = detect_language(case)
        assert det.code == "ur_roman", f"Failed for '{case}', got {det.code}"
        assert det.confidence >= 0.80


def test_language_detection_urdu_script():
    det = detect_language("میرا آرڈر ابھی تک نہیں آیا")
    assert det.code == "ur"
    assert det.confidence >= 0.95


def test_language_detection_hindi_script():
    det = detect_language("मेरा ऑर्डर अभी तक नहीं आया")
    assert det.code == "hi"
    assert det.confidence >= 0.95


def test_language_detection_malay():
    det = detect_language("Pesanan saya masih belum sampai. Tolong semak.")
    assert det.code == "ms"
    assert det.confidence >= 0.85


def test_language_detection_mixed_language():
    det = detect_language("Mera order still nahi aya, please help.")
    assert det.code == "ur_roman"
    assert det.is_mixed is True


def test_terminology_preservation():
    text = "Order #ORD-7821 has not arrived. Refund amount is $49.99 for ticket #SN-10492."
    protected, tokens = preserve_terminology(text)
    assert len(tokens) >= 2
    # Ensure placeholder is in protected text
    assert "__SN_TERM_" in protected
    # Ensure restoration recovers original text exactly
    restored = restore_terminology(protected, tokens)
    assert restored == text
    assert "#ORD-7821" in restored
    assert "#SN-10492" in restored
    assert "$49.99" in restored


def test_translate_for_agent_roman_urdu():
    result = translate_for_agent("mera order abhi tk nhi aya")
    assert result["source_language"] == "ur_roman"
    assert result["target_language"] == "en"
    assert "order" in result["translated_text"].lower()
    assert result["confidence"] >= 0.80


def test_translate_for_customer_roman_urdu():
    english_reply = "Your order has been shipped and should arrive tomorrow."
    result = translate_for_customer(english_reply, target_lang="ur_roman")
    assert result["source_language"] == "en"
    assert result["target_language"] == "ur_roman"
    assert "order" in result["translated_text"].lower() or "ship" in result["translated_text"].lower()
    assert len(result["translated_text"]) > 10


def test_supported_languages_list():
    assert "en" in SUPPORTED_LANGUAGES
    assert "ur_roman" in SUPPORTED_LANGUAGES
    assert "ur" in SUPPORTED_LANGUAGES
    assert "hi" in SUPPORTED_LANGUAGES
    assert "ms" in SUPPORTED_LANGUAGES
    assert "auto" in SUPPORTED_LANGUAGES
