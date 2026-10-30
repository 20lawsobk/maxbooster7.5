"""Versioned public peak-content stream, separate from historical context runs."""
import math
import hashlib
import json
import re
from urllib.parse import urlsplit

PEAK_POLICY = "public-peak-shortform-v1"
PEAK_ARCHITECTURE = "public-content-transformer-v2"
PEAK_METRIC = "public_complete_post_likes_plus_reposts_v1"
DEFAULT_CONFIG = {"width": 256, "layers": 6, "heads": 8, "expansion": 4}


def peak_stream(config=None):
    config = dict(DEFAULT_CONFIG if config is None else config)
    if (set(config) != set(DEFAULT_CONFIG)
            or any(type(value) is not int for value in config.values())
            or not 128 <= config["width"] <= 1024
            or not 1 <= config["layers"] <= 16
            or not 1 <= config["heads"] <= 32
            or config["width"] % config["heads"]
            or not 1 <= config["expansion"] <= 8):
        raise ValueError("Invalid bounded public-content transformer configuration")
    return {"schema": 1, "policy": PEAK_POLICY, "architecture": PEAK_ARCHITECTURE,
            "model_config": config,
            "migration": "new-v2-stream-preserving-context-v1-history"}


def validate_peak_record(record):
    provenance = record.get("live_provenance", {})
    text = record.get("text", "")
    metric, value = provenance.get("metric"), provenance.get("value")
    source = provenance.get("source", "")
    domain = provenance.get("domain")
    url = urlsplit(record.get("source", ""))
    expected_host = ("mastodon.social" if source in {
                         "mastodon_trending", "mastodon_peak_music", "mastodon_peak_social",
                         "mastodon_peak_advertising", "mastodon_peak_culture"} else
                     "bsky.app" if source in {
                         "bluesky_peak_music", "bluesky_peak_social",
                         "bluesky_peak_advertising", "bluesky_peak_culture"} else None)
    if (provenance.get("learning_policy") != PEAK_POLICY or metric != PEAK_METRIC
            or type(value) not in (int, float) or not math.isfinite(value) or value <= 0
            or expected_host is None or url.scheme != "https"
            or (source == "mastodon_trending" and domain != "social")
            or (source != "mastodon_trending" and source not in {
                "mastodon_peak_" + str(domain), "bluesky_peak_" + str(domain)})
            or url.hostname != expected_host or url.username or url.password
            or not 60 <= len(text) <= 4096 or len(text.split()) < 8
            or record.get("private") is not False or provenance.get("access") != "public"):
        raise ValueError("Peak curriculum requires complete public posts with measured engagement")


def training_texts(records):
    """Keep plain posts; optionally label only observable source sentence stages.

    This is structural supervision, not inferred goal/tone/platform performance.
    An explicit final call to action is mandatory; no missing words are supplied.
    """
    texts = [record["text"] for record in records]
    staged = []
    cta = re.compile(r"^(?:listen|watch|read|join|follow|subscribe|stream|share|visit|"
                     r"download|register|sign up|check out|buy|book|support)\b", re.I)
    for text in texts:
        # Boundaries are offsets into the unchanged source, including whitespace.
        starts = [match.end() for match in re.finditer(r"[.!?](?:[\"'”’])?\s+", text)]
        if len(starts) < 2 or "<STAGE_" in text:
            continue
        first, last = starts[0], starts[-1]
        if first >= last or not cta.match(text[last:].lstrip()):
            continue
        staged.append("<STAGE_HOOK>" + text[:first] + "<STAGE_BODY>" +
                      text[first:last] + "<STAGE_CTA>" + text[last:])
    combined = texts + staged
    metadata = {"policy": "plain-plus-source-stages-v1", "plain_records": len(texts),
                "derived_stage_records": len(staged),
                "texts_sha256": hashlib.sha256(json.dumps(combined, ensure_ascii=True,
                    separators=(",", ":")).encode()).hexdigest()}
    return combined, metadata
