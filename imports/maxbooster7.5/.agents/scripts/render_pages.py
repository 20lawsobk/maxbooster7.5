import fitz
doc = fitz.open("reports/max-booster-competitive-benchmark.pdf")
pages_to_render = {
    9: "studio",
    13: "beat_marketplace",
    17: "distribution",
    24: "social_media",
}
for pnum, label in pages_to_render.items():
    page = doc[pnum - 1]
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
    pix.save(f".agents/outputs/{label}.png")
print("done", doc.page_count)
