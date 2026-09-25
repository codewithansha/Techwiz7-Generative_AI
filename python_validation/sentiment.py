"""Lexicon-based sentiment and emotion estimate (SRS steps 17-18).

Used when GenAI is unavailable and as a cross-check. It describes tone only; urgency and
priority never read it.
"""

from __future__ import annotations

import re

STRONG_NEGATIVE = {
    "furious", "livid", "outraged", "disgusting", "disgusted", "worst", "useless", "scam", "fraud", "pathetic",
    "horrible", "terrible", "unacceptable", "ridiculous", "appalling", "incompetent", "hate", "never again", "fed up",
}
NEGATIVE = {
    "disappointed", "unhappy", "annoyed", "frustrated", "frustrating", "upset", "bad", "poor", "broken", "late",
    "delayed", "damaged", "wrong", "failed", "problem", "issue", "not working", "complaint", "angry", "worried",
    "concerned", "confused", "missing", "rude", "slow", "overcharged",
}
POSITIVE = {"thanks", "thank you", "great", "appreciate", "appreciated", "happy", "love", "excellent", "helpful", "pleased", "resolved"}
EMOTIONS = {
    "anger": {"furious", "livid", "outraged", "angry", "hate", "ridiculous", "unacceptable", "disgusting"},
    "frustration": {"frustrated", "frustrating", "fed up", "again", "still", "third time", "annoyed", "useless"},
    "disappointment": {"disappointed", "let down", "expected better", "unhappy"},
    "confusion": {"confused", "don't understand", "unclear", "not sure", "why"},
    "urgency": {"urgent", "immediately", "asap", "right now", "emergency", "today"},
}


def _hits(text: str, words: set[str]) -> int:
    return sum(len(re.findall(rf"(?<![a-z]){re.escape(w)}(?![a-z])", text)) for w in words)


def estimate_sentiment(text: str) -> dict:
    lowered = (text or "").lower()
    strong = _hits(lowered, STRONG_NEGATIVE)
    negative = _hits(lowered, NEGATIVE)
    positive = _hits(lowered, POSITIVE)
    shouting = len(re.findall(r"\b[A-Z]{4,}\b", text or "")) + (text or "").count("!!")
    score = positive - negative - 2 * strong - shouting
    if strong or shouting >= 2 or score <= -4:
        label = "strongly_negative"
    elif score < 0:
        label = "negative"
    elif score > 0:
        label = "positive"
    else:
        label = "neutral"
    emotions = [name for name, words in EMOTIONS.items() if _hits(lowered, words)]
    if shouting >= 2 and "anger" not in emotions:
        emotions.append("anger")
    return {"sentiment": label, "emotion_indicators": emotions, "score": score}
