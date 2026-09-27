---
name: Training corpus rights boundary
description: Dataset distribution labels can differ from rights to underlying text, especially in aggregated or web-crawled corpora.
---

A dataset-level license for packaging, metadata, or a collection does not by itself demonstrate that every underlying text item is licensed for model training. Verify source-level provenance and permitted reuse; reject mixed, scraped, or unclear sources.

**Why:** Aggregated corpora can label a bundle CC0 or MIT while the text originates from third-party pages or user submissions with separate rights and privacy terms.

**How to apply:** Before ingestion, inspect first-party dataset documentation and source records, require explicit license/provenance/nonprivate metadata, preserve holdouts, and do not infer training permission from a host-platform tag alone.