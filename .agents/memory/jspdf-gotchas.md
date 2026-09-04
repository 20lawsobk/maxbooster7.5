---
name: jsPDF + jspdf-autotable gotchas
description: Non-obvious jsPDF 4.x / jspdf-autotable API quirks that cause silent clipping, overlap, or garbled text in generated PDFs — check this before debugging a "why does my pill/label look wrong" layout bug.
---

# jsPDF + jspdf-autotable gotchas

Found while building a landscape jsPDF report with custom pill/badge/eyebrow helpers (jsPDF 4.2.1, jspdf-autotable 5.x). All four caused real, visually-confirmed bugs (clipped pill text, overlapping labels, overlapping page sections, a spurious console warning) in one session — not theoretical.

**1. The rounded-rect method is `doc.roundedRect(x, y, w, h, rx, ry, style)`, not `doc.roundRect(...)`.**
`roundRect` is `undefined` on the instance; `'roundedRect' in doc` is the real one. Confirm via `Object.getOwnPropertyNames` walked up the prototype chain (plugin-added methods aren't own-properties of the immediate prototype at depth 0 the way you'd expect) or just test both names before writing a rounded-box helper.

**2. `{ charSpace: N }` letter-spacing passed to `doc.text()` is invisible to `doc.getTextWidth()` / `getStringUnitWidth()`.**
Any helper that measures a string's width (to size a pill, center text, or place a sibling element after it) and *separately* renders that same string with `charSpace` will under-measure by `charSpace × length`. Symptom is either clipped text inside a tightly-fit box, or a second element positioned too close and overlapping the first.
**Why:** width-measurement APIs compute default glyph advances only; they don't know about the per-character-spacing render option.
**How to apply:** don't add charSpace to any text whose rendered width is later measured for layout math. If the letterspaced look matters, add the compensation into the width calc (`+ charSpace * str.length`) instead of trying to remember to do it at every call site — call sites will forget.

**3. Standard 14 PDF fonts (helvetica, etc.) use WinAnsiEncoding — most Unicode math symbols silently render as the wrong glyph.**
Em dash, en dash, curly quotes, ellipsis, bullet, ×, ÷, ° all work. `≤`, `≥`, and most other math/technical Unicode do not — they render as garbage (e.g. a stray "d") with no error or warning. This bites you even when the source `.mjs` file only contains an ASCII `\u2264` escape sequence — grepping the source file for the literal character finds nothing because the actual Unicode codepoint only exists in memory once Node evaluates the escape at runtime. Use plain-language ASCII instead ("2/10 or below") rather than the symbol.

**4. jspdf-autotable's "N units width could not fit page" is not always an overflow.**
If every column has an explicit `cellWidth` (columnStyles), autoTable treats all columns as non-resizable. The warning fires whenever the *sum* of explicit widths differs from the available content width in *either* direction — including when the sum is **less** than available width, because there's no resizable column left to absorb the slack. Fix by making explicit column widths sum to exactly the table's available width (page width minus left/right margins), not by assuming the table is overflowing.
