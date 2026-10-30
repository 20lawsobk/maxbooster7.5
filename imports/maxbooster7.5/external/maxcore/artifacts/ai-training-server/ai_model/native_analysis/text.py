"""Deterministic, measurement-based text analysis.

This module deliberately does not infer topics, intent, authorship, or predicted
performance.  Every value is derived from the supplied string.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from typing import Any, Dict, Iterable, List, Sequence, Tuple


_WORD_RE = re.compile(r"[^\W_]+(?:[’'-][^\W_]+)*", re.UNICODE)
_URL_RE = re.compile(r"(?i)\b(?:https?://|www\.)[^\s<>()]+")
_HASHTAG_RE = re.compile(r"(?<![\w@])#[^\W_][\w]*", re.UNICODE)
_MENTION_RE = re.compile(r"(?<![\w@])@[^\W_][\w.]*", re.UNICODE)
_SENTENCE_RE = re.compile(r"[^.!?。！？]+(?:[.!?。！？]+|$)", re.UNICODE)

_STOPWORDS = frozenset(
    """a about above after again against all am an and any are aren't as at be
    because been before being below between both but by can cannot could couldn't
    did didn't do does doesn't doing don't down during each few for from further
    had hadn't has hasn't have haven't having he he'd he'll he's her here here's
    hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't
    it it's its itself just me more most mustn't my myself no nor not of off on
    once only or other ought our ours ourselves out over own same she she'd she'll
    she's should shouldn't so some such than that that's the their theirs them
    themselves then there there's these they they'd they'll they're they've this
    those through to too under until up very was wasn't we we'd we'll we're we've
    were weren't what what's when when's where where's which while who who's whom
    why why's with won't would wouldn't you you'd you'll you're you've your yours
    yourself yourselves""".split()
)

# Small, published-as-data lexical lists. Matches, rather than opaque model
# outputs, are returned so callers can audit every polarity contribution.
_POSITIVE = frozenset(
    """accurate benefit beneficial best clear delight delighted easy effective
    enjoy excellent fair fast good great happy helpful improve improved love
    loved reliable safe simple strong success successful useful welcome win
    wonderful works""".split()
)
_NEGATIVE = frozenset(
    """angry awful bad broken confusing danger dangerous difficult error fail
    failed failure hate hated harmful hard poor problem risky sad slow terrible
    unclear unreliable unsafe weak worse worst wrong""".split()
)
_NEGATIONS = frozenset(
    """barely cannot can't couldn't didn't doesn't don't hardly hasn't haven't
    isn't lack neither never no nobody none nor not nothing nowhere shouldn't
    wasn't weren't without won't wouldn't""".split()
)
_CTA_PHRASES = (
    "buy now",
    "call now",
    "contact us",
    "download now",
    "get started",
    "join now",
    "learn more",
    "read more",
    "request a demo",
    "shop now",
    "sign up",
    "subscribe",
    "try free",
)

_LIMITATIONS = [
    "Deterministic token and pattern measurements only; no trained model or semantic inference is used.",
    "Word and sentence boundaries are rule-based and can differ for abbreviations, languages, and scripts without whitespace.",
    "Readability uses English Flesch formulas and a heuristic English syllable counter; values are not valid for every language or proper name.",
    "Lexical sentiment covers only the disclosed word list and a three-token negation window; it does not detect sarcasm, context, or emotion.",
    "Keywords are frequency-ranked tokens after an English stopword list, not inferred topics or importance predictions.",
]


def _rounded(value: float, digits: int = 3) -> float:
    """Return a finite rounded float suitable for JSON serialization."""
    if not math.isfinite(value):
        return 0.0
    return round(value, digits)


def _tokens(text: str) -> List[str]:
    return [match.group(0) for match in _WORD_RE.finditer(text)]


def _sentence_count(text: str) -> int:
    # Dots inside observed URLs, decimal numbers, and common English
    # abbreviations are not sentence boundaries.
    masked = _URL_RE.sub(lambda match: re.sub(r"[.!?]", " ", match.group(0)), text)
    masked = re.sub(r"(?<=\d)\.(?=\d)", " ", masked)
    masked = re.sub(
        r"\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\.",
        lambda match: match.group(0)[:-1] + " ",
        masked,
        flags=re.IGNORECASE,
    )
    return sum(
        1
        for match in _SENTENCE_RE.finditer(masked)
        if _WORD_RE.search(match.group(0))
    )


def _paragraph_count(text: str) -> int:
    return sum(1 for part in re.split(r"(?:\r?\n)[ \t]*(?:\r?\n)+", text) if part.strip())


def _syllables(word: str) -> int:
    """Approximate English syllables with a documented vowel-group heuristic."""
    ascii_word = unicodedata.normalize("NFKD", word).encode("ascii", "ignore").decode()
    cleaned = re.sub(r"[^a-z]", "", ascii_word.lower())
    if not cleaned:
        return 1
    groups = len(re.findall(r"[aeiouy]+", cleaned))
    if len(cleaned) > 2 and cleaned.endswith("e") and not cleaned.endswith(("le", "ye")):
        groups -= 1
    if len(cleaned) > 3 and cleaned.endswith("es") and not cleaned.endswith(("aes", "ees", "oes")):
        groups -= 1
    return max(1, groups)


def _ranked(counter: Counter, limit: int) -> List[Dict[str, Any]]:
    return [
        {"term": term, "count": count}
        for term, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))[:limit]
    ]


def _observed(pattern: re.Pattern, text: str) -> List[Dict[str, Any]]:
    counter = Counter(match.group(0) for match in pattern.finditer(text))
    return [
        {"token": token, "count": count}
        for token, count in sorted(counter.items(), key=lambda item: (-item[1], item[0].casefold()))
    ]


def _cta_matches(text: str) -> List[Dict[str, Any]]:
    folded = text.casefold()
    found = []
    for phrase in _CTA_PHRASES:
        matches = list(re.finditer(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", folded))
        if matches:
            found.append(
                {
                    "phrase": phrase,
                    "count": len(matches),
                    "character_offsets": [match.start() for match in matches[:20]],
                }
            )
    return found


def _sentiment(tokens: Sequence[str]) -> Dict[str, Any]:
    folded = [token.casefold().replace("’", "'") for token in tokens]
    evidence = []
    positive = negative = 0
    for index, token in enumerate(folded):
        if token not in _POSITIVE and token not in _NEGATIVE:
            continue
        base = "positive" if token in _POSITIVE else "negative"
        window = folded[max(0, index - 3) : index]
        negators = [item for item in window if item in _NEGATIONS]
        negated = bool(negators)
        effective = (
            "negative" if base == "positive" and negated
            else "positive" if base == "negative" and negated
            else base
        )
        if effective == "positive":
            positive += 1
        else:
            negative += 1
        evidence.append(
            {
                "token": tokens[index],
                "token_index": index,
                "lexicon_polarity": base,
                "negated": negated,
                "negator": negators[-1] if negators else None,
                "effective_polarity": effective,
            }
        )
    total = positive + negative
    return {
        "method": "disclosed fixed lexical match with polarity inversion when a negator occurs in the preceding three tokens",
        "positive_matches": positive,
        "negative_matches": negative,
        "net_matches": positive - negative,
        "normalized_net": _rounded((positive - negative) / total) if total else 0.0,
        "matched_evidence": evidence[:100],
        "evidence_truncated": len(evidence) > 100,
    }


def analyze_text(text: str) -> Dict[str, Any]:
    """Analyze ``text`` and return the canonical native-analysis envelope."""
    if not isinstance(text, str):
        raise TypeError("text must be a string")

    normalized = unicodedata.normalize("NFC", text)
    tokens = _tokens(normalized)
    folded = [token.casefold() for token in tokens]
    sentences = _sentence_count(normalized)
    paragraphs = _paragraph_count(normalized) if normalized.strip() else 0
    keyword_tokens = [token for token in folded if token not in _STOPWORDS and len(token) > 1]
    keywords = Counter(keyword_tokens)
    bigrams = Counter(" ".join(pair) for pair in zip(keyword_tokens, keyword_tokens[1:]))
    trigrams = Counter(
        " ".join(group)
        for group in zip(keyword_tokens, keyword_tokens[1:], keyword_tokens[2:])
    )

    syllables = sum(_syllables(token) for token in tokens)
    if tokens and sentences:
        words_per_sentence = len(tokens) / sentences
        syllables_per_word = syllables / len(tokens)
        readability = {
            "applicable": True,
            "language_assumption": "English",
            "syllable_method": "heuristic vowel groups with terminal-e/es adjustment",
            "flesch_reading_ease": {
                "formula": "206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)",
                "value": _rounded(206.835 - 1.015 * words_per_sentence - 84.6 * syllables_per_word, 2),
            },
            "flesch_kincaid_grade": {
                "formula": "0.39*(words/sentences) + 11.8*(syllables/words) - 15.59",
                "value": _rounded(0.39 * words_per_sentence + 11.8 * syllables_per_word - 15.59, 2),
            },
            "syllable_count_estimate": syllables,
        }
    else:
        readability = {
            "applicable": False,
            "language_assumption": "English",
            "reason": "At least one word and one sentence are required.",
        }

    analysis = {
        "counts": {
            "characters": len(normalized),
            "characters_without_whitespace": sum(not char.isspace() for char in normalized),
            "words": len(tokens),
            "unique_words_casefolded": len(set(folded)),
            "sentences": sentences,
            "paragraphs": paragraphs,
        },
        "top_keywords": _ranked(keywords, 15),
        "top_bigrams": _ranked(bigrams, 10),
        "top_trigrams": _ranked(trigrams, 10),
        "readability": readability,
        "lexical_sentiment": _sentiment(tokens),
        "observed_tokens": {
            "urls": _observed(_URL_RE, normalized),
            "hashtags": _observed(_HASHTAG_RE, normalized),
            "mentions": _observed(_MENTION_RE, normalized),
            "cta_phrases": _cta_matches(normalized),
        },
    }
    return {
        "schema_version": 1,
        "source": "maxcore_native_analysis",
        "kind": "text",
        "method": "deterministic Unicode tokenization, frequency counts, regex token observation, English readability formulas, and auditable lexical matching",
        "analysis": analysis,
        "limitations": list(_LIMITATIONS),
    }