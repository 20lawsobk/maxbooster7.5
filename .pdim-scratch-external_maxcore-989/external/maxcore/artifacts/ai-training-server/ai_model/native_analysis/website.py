"""Offline, deterministic analysis of supplied HTML."""

from __future__ import annotations

import json
import math
import re
from collections import Counter
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

from .text import analyze_text


_MAX_ITEMS = 500
_MAX_TEXT = 250_000
_MAX_NESTING = 512
_SOCIAL_HOSTS = {
    "bsky.app", "facebook.com", "github.com", "instagram.com", "linkedin.com",
    "pinterest.com", "tiktok.com", "twitter.com", "x.com", "youtube.com",
}
_VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}


def _attrs(items: List[Tuple[str, Optional[str]]]) -> Dict[str, str]:
    return {str(key).casefold(): value or "" for key, value in items}


def _clean(value: str, limit: int = 2000) -> str:
    return re.sub(r"\s+", " ", value).strip()[:limit]


def _resolved(value: str, base_url: str) -> str:
    return urljoin(base_url, value.strip()) if value.strip() else ""


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").casefold().removeprefix("www.")


def _social_platform(url: str) -> Optional[str]:
    host = _host(url)
    for known in _SOCIAL_HOSTS:
        if host == known or host.endswith("." + known):
            return known
    return None


def _reject_json_constant(value: str) -> None:
    raise ValueError("non-finite JSON number: " + value)


def _capped_json(value: Any, depth: int = 0) -> Any:
    """Keep parsed JSON finite and bounded while preserving actual values."""
    if depth > 30:
        return {"_truncated": "maximum structured-data depth exceeded"}
    if isinstance(value, dict):
        result = {
            str(key)[:500]: _capped_json(item, depth + 1)
            for key, item in list(value.items())[:_MAX_ITEMS]
        }
        if len(value) > _MAX_ITEMS:
            result["_truncated_items"] = len(value) - _MAX_ITEMS
        return result
    if isinstance(value, list):
        result = [_capped_json(item, depth + 1) for item in value[:_MAX_ITEMS]]
        if len(value) > _MAX_ITEMS:
            result.append({"_truncated_items": len(value) - _MAX_ITEMS})
        return result
    if isinstance(value, str):
        return value[:10_000]
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("non-finite JSON number")
    return value


class _DocumentParser(HTMLParser):
    def __init__(self, final_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.final_url = final_url
        self.stack: List[str] = []
        self.ignored_depth = 0
        self.title_parts: List[str] = []
        self.current_heading: Optional[Dict[str, Any]] = None
        self.current_link: Optional[Dict[str, Any]] = None
        self.current_button: Optional[Dict[str, Any]] = None
        self.current_label: Optional[Dict[str, Any]] = None
        self.current_jsonld: Optional[List[str]] = None
        self.visible_parts: List[str] = []
        self.visible_length = 0
        self.metas: List[Dict[str, str]] = []
        self.headings: List[Dict[str, Any]] = []
        self.links: List[Dict[str, Any]] = []
        self.images: List[Dict[str, Any]] = []
        self.forms: List[Dict[str, Any]] = []
        self.active_form: Optional[Dict[str, Any]] = None
        self.labels: List[Dict[str, str]] = []
        self.buttons: List[Dict[str, Any]] = []
        self.canonicals: List[str] = []
        self.structured_data: List[Dict[str, Any]] = []
        self.viewport: Optional[str] = None
        self.truncated = False

    def _append(self, collection: List[Any], value: Any) -> None:
        if len(collection) < _MAX_ITEMS:
            collection.append(value)
        else:
            self.truncated = True

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        tag = tag.casefold()
        attributes = _attrs(attrs)
        if len(self.stack) < _MAX_NESTING:
            self.stack.append(tag)
        else:
            self.truncated = True
        if tag in {"script", "style", "template"}:
            self.ignored_depth += 1
        if tag == "meta":
            item = {
                "name": attributes.get("name", ""),
                "property": attributes.get("property", ""),
                "http_equiv": attributes.get("http-equiv", ""),
                "content": _clean(attributes.get("content", "")),
            }
            self._append(self.metas, item)
            if attributes.get("name", "").casefold() == "viewport":
                self.viewport = item["content"]
        elif tag == "link":
            rels = attributes.get("rel", "").casefold().split()
            if "canonical" in rels and attributes.get("href"):
                self._append(self.canonicals, _resolved(attributes["href"], self.final_url))
        elif tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self.current_heading = {"level": int(tag[1]), "parts": []}
        elif tag == "a":
            href = attributes.get("href", "")
            self.current_link = {
                "href": href,
                "resolved_url": _resolved(href, self.final_url),
                "rel": attributes.get("rel", ""),
                "parts": [],
                "aria_label": _clean(attributes.get("aria-label", "")),
            }
        elif tag == "img":
            alt = _clean(attributes.get("alt", ""))
            self._append(
                self.images,
                {
                    "src": attributes.get("src", ""),
                    "resolved_url": _resolved(attributes.get("src", ""), self.final_url),
                    "alt": alt,
                    "alt_present": "alt" in attributes,
                    "width": attributes.get("width", ""),
                    "height": attributes.get("height", ""),
                    "loading": attributes.get("loading", ""),
                },
            )
            if self.current_link is not None and alt:
                self.current_link["parts"].append(alt)
        elif tag == "form":
            form = {
                "action": attributes.get("action", ""),
                "resolved_action": _resolved(attributes.get("action", ""), self.final_url),
                "method": attributes.get("method", "get").casefold(),
                "inputs": [],
            }
            self._append(self.forms, form)
            self.active_form = form
        elif tag in {"input", "select", "textarea"} and self.active_form is not None:
            self._append(
                self.active_form["inputs"],
                {
                    "element": tag,
                    "type": attributes.get("type", "text" if tag == "input" else tag),
                    "name": attributes.get("name", ""),
                    "id": attributes.get("id", ""),
                    "aria_label": _clean(attributes.get("aria-label", "")),
                    "required": "required" in attributes,
                },
            )
        elif tag == "label":
            self.current_label = {"for": attributes.get("for", ""), "parts": []}
        elif tag == "button":
            self.current_button = {
                "type": attributes.get("type", "submit"),
                "aria_label": _clean(attributes.get("aria-label", "")),
                "parts": [],
            }
        if tag == "script" and attributes.get("type", "").split(";")[0].strip().casefold() == "application/ld+json":
            self.current_jsonld = []

    def handle_startendtag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_data(self, data: str) -> None:
        if self.current_jsonld is not None:
            self.current_jsonld.append(data)
        if self.ignored_depth:
            return
        cleaned = _clean(data, 10_000)
        if not cleaned:
            return
        remaining = _MAX_TEXT - self.visible_length
        if remaining > 0:
            kept = cleaned[:remaining]
            self.visible_parts.append(kept)
            self.visible_length += len(kept) + (1 if len(self.visible_parts) > 1 else 0)
            if len(kept) < len(cleaned):
                self.truncated = True
        else:
            self.truncated = True
        if self.stack and self.stack[-1] == "title":
            self.title_parts.append(cleaned)
        if self.current_heading is not None:
            self.current_heading["parts"].append(cleaned)
        if self.current_link is not None:
            self.current_link["parts"].append(cleaned)
        if self.current_button is not None:
            self.current_button["parts"].append(cleaned)
        if self.current_label is not None:
            self.current_label["parts"].append(cleaned)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if tag == "script" and self.current_jsonld is not None:
            raw = "".join(self.current_jsonld).strip()
            try:
                parsed = json.loads(raw, parse_constant=_reject_json_constant)
                self._append(self.structured_data, {"valid": True, "data": _capped_json(parsed)})
            except (json.JSONDecodeError, RecursionError, ValueError) as exc:
                self._append(
                    self.structured_data,
                    {"valid": False, "error": str(exc)[:300], "raw_excerpt": raw[:300]},
                )
            self.current_jsonld = None
        if tag in {"script", "style", "template"} and self.ignored_depth:
            self.ignored_depth -= 1
        if tag.startswith("h") and len(tag) == 2 and tag[1].isdigit() and self.current_heading is not None:
            self._append(
                self.headings,
                {"level": self.current_heading["level"], "text": _clean(" ".join(self.current_heading["parts"]))},
            )
            self.current_heading = None
        elif tag == "a" and self.current_link is not None:
            link = self.current_link
            link["text"] = _clean(" ".join(link.pop("parts")))
            self._append(self.links, link)
            self.current_link = None
        elif tag == "button" and self.current_button is not None:
            button = self.current_button
            button["text"] = _clean(" ".join(button.pop("parts")))
            self._append(self.buttons, button)
            self.current_button = None
        elif tag == "label" and self.current_label is not None:
            label = self.current_label
            self._append(
                self.labels,
                {"for": label["for"], "text": _clean(" ".join(label["parts"]))},
            )
            self.current_label = None
        elif tag == "form":
            self.active_form = None
        # HTMLParser is tolerant; remove through the matching open element so a
        # malformed close tag cannot leave script text permanently suppressed.
        if tag in self.stack:
            index = len(self.stack) - 1 - self.stack[::-1].index(tag)
            del self.stack[index:]


def _link_kind(value: str, final_url: str) -> str:
    if not value:
        return "empty"
    if value.startswith("#"):
        return "fragment"
    parsed = urlparse(value)
    if parsed.scheme in {"mailto", "tel"}:
        return parsed.scheme
    resolved = urlparse(_resolved(value, final_url))
    if resolved.scheme not in {"http", "https"}:
        return "other"
    return "internal" if _host(resolved.geturl()) == _host(final_url) else "external"


def _issue(code: str, message: str, evidence: Any) -> Dict[str, Any]:
    return {"code": code, "message": message, "evidence": evidence}


def analyze_website_html(html: str, final_url: str) -> Dict[str, Any]:
    """Analyze supplied HTML without making a network request."""
    if not isinstance(html, str):
        raise TypeError("html must be a string")
    if not isinstance(final_url, str):
        raise TypeError("final_url must be a string")

    parser = _DocumentParser(final_url)
    parse_errors: List[str] = []
    try:
        parser.feed(html)
        parser.close()
    except (ValueError, RecursionError) as exc:
        parse_errors.append(str(exc)[:300])

    title = _clean(" ".join(parser.title_parts))
    descriptions = [
        meta["content"] for meta in parser.metas
        if meta["name"].casefold() == "description" and meta["content"]
    ]
    for link in parser.links:
        link["kind"] = _link_kind(link["href"], final_url)
    social_links = [
        {"platform_domain": platform, "url": link["resolved_url"], "text": link["text"]}
        for link in parser.links
        if (platform := _social_platform(link["resolved_url"]))
    ]
    visible_text = _clean(" ".join(parser.visible_parts), _MAX_TEXT)
    issues: List[Dict[str, Any]] = []
    if not title:
        issues.append(_issue("missing_title", "Add a non-empty HTML title.", {"title": title}))
    if not descriptions:
        issues.append(_issue("missing_meta_description", "Add a meta description.", {"matching_tags": 0}))
    h1s = [heading for heading in parser.headings if heading["level"] == 1 and heading["text"]]
    if not h1s:
        issues.append(_issue("missing_h1", "Add a non-empty level-one heading.", {"h1_count": 0}))
    elif len(h1s) > 1:
        issues.append(_issue("multiple_h1", "Review multiple level-one headings for document structure.", {"h1_count": len(h1s)}))
    if not parser.viewport:
        issues.append(_issue("missing_mobile_viewport", "Add a viewport meta tag for responsive browser layout.", {"viewport": None}))
    missing_alts = [image["resolved_url"] or image["src"] for image in parser.images if not image["alt_present"]]
    if missing_alts:
        issues.append(_issue("images_missing_alt_attribute", "Add alt attributes; use empty alt only for decorative images.", {"count": len(missing_alts), "examples": missing_alts[:10]}))
    empty_links = [
        link["resolved_url"] or link["href"] for link in parser.links
        if not link["text"] and not link["aria_label"]
    ]
    if empty_links:
        issues.append(_issue("links_without_accessible_text", "Give links visible text or an aria-label.", {"count": len(empty_links), "examples": empty_links[:10]}))
    invalid_ld = sum(not item["valid"] for item in parser.structured_data)
    if invalid_ld:
        issues.append(_issue("invalid_json_ld", "Correct invalid JSON-LD script content.", {"invalid_blocks": invalid_ld}))
    label_targets = {label["for"] for label in parser.labels if label["for"]}
    unlabeled_inputs = [
        item
        for form in parser.forms
        for item in form["inputs"]
        if item["type"].casefold() not in {"hidden", "submit", "button", "reset", "image"}
        and not item["aria_label"]
        and (not item["id"] or item["id"] not in label_targets)
    ]
    if unlabeled_inputs:
        issues.append(
            _issue(
                "form_controls_without_observed_label",
                "Associate visible labels or aria-labels with form controls.",
                {"count": len(unlabeled_inputs), "examples": unlabeled_inputs[:10]},
            )
        )

    analysis = {
        "document": {
            "final_url": final_url,
            "title": title,
            "meta": parser.metas,
            "meta_descriptions": descriptions,
            "canonical_urls": parser.canonicals,
            "mobile_viewport": parser.viewport,
            "headings": parser.headings,
        },
        "links": parser.links,
        "link_counts_by_kind": dict(sorted(Counter(link["kind"] for link in parser.links).items())),
        "social_links": social_links,
        "images": parser.images,
        "forms": parser.forms,
        "labels": parser.labels,
        "buttons": parser.buttons,
        "structured_data": parser.structured_data,
        "visible_text": visible_text,
        "visible_text_analysis": analyze_text(visible_text)["analysis"],
        "issues": issues,
        "parser": {
            "parse_errors": parse_errors,
            "output_truncated": parser.truncated,
            "item_cap_per_collection": _MAX_ITEMS,
            "visible_text_character_cap": _MAX_TEXT,
        },
    }
    return {
        "schema_version": 1,
        "source": "maxcore_native_analysis",
        "kind": "website",
        "method": "offline Python HTMLParser extraction, RFC-style URL resolution, observed element counts, and native visible-text measurement",
        "analysis": analysis,
        "limitations": [
            "Only the supplied HTML is analyzed; no network request, rendering, CSS evaluation, JavaScript execution, robots check, or linked-page crawl occurs.",
            "The route decodes fetched HTML as UTF-8 with replacement characters; a page declaring another character encoding can be measured incorrectly.",
            "HTMLParser is fault tolerant, so severely malformed markup may have different structure in a browser.",
            "Accessibility issues are limited to directly observable markup checks and are not a conformance audit.",
            "Issue entries are evidence-backed markup observations, not conversion, quality, SEO-ranking, or performance predictions.",
            "Visible text excludes script, style, template, and comment content but cannot determine CSS-hidden text.",
            "Collection and visible-text caps prevent unbounded output; parser.output_truncated reports when a cap is reached.",
        ],
    }