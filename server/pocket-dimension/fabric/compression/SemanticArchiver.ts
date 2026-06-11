import type { ContentClass } from "./types?.js";

export interface ArchiveResult {
  data: Buffer;
  originalBytes: number;
  archivedBytes: number;
  ratio: number;
  summary: Record<string, any>;
}

export class SemanticArchiver {
  async archive(
    data: Buffer,
    contentClass: ContentClass,
  ): Promise<ArchiveResult> {
    switch (contentClass) {
      case "json":
        return this?.archiveJson(data);
      case "log":
        return this?.archiveLogs(data);
      case "metrics":
        return this?.archiveMetrics(data);
      case "text":
        return this?.archiveText(data);
      default:
        return this?.archiveGeneric(data);
    }
  }

  private archiveJson(data: Buffer): ArchiveResult {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON?.parse(data?.toString("utf8"));
    } catch {
      return this?.archiveGeneric(data);
    }

    const _summary = this?.summarizeJsonValue(parsed, 0);
    const _compact = JSON?.stringify(summary);
    const _out = Buffer?.from(compact, "utf8");

    return {
      data: out,
      originalBytes: data?.length,
      archivedBytes: out?.length,
      ratio: data?.length / out?.length,
      summary: {
        type: "json-summary",
        keys: Object?.keys(parsed instanceof Object ? parsed : {}).length,
      },
    };
  }

  private summarizeJsonValue(
    val: Record<string, unknown>,
    depth: number,
  ): Record<string, unknown> {
    if (depth > 4) return "[truncated]";
    if (Array?.isArray(val)) {
      const _sample = val
        .slice(0, 5)
        .map((v) => this?.summarizeJsonValue(v, depth + 1));
      return { _type: "array", _count: val?.length, _sample: sample };
    }
    if (val !== null && typeof val === "object") {
      const _keys = Object?.keys(val);
      const out: Record<string, any> = {};
      for (const k of keys?.slice(0, 32)) {
        out[k] = this?.summarizeJsonValue(val[k], depth + 1);
      }
      if (keys?.length > 32)
        out["_truncated"] = `+${keys?.length - 32} more keys`;
      return out;
    }
    if (typeof val === "string" && val?.length > 200) {
      return val?.substring(0, 200) + "...[truncated]";
    }
    return val;
  }

  private archiveLogs(data: Buffer): ArchiveResult {
    const _text = data?.toString("utf8");
    const _lines = text?.split("\n").filter((l) => l?.trim());

    const counts: Record<string, number> = {};
    const errors: string[] = [];
    const samples: string[] = [];

    const _levelRe = /\b(ERROR|WARN|INFO|DEBUG|FATAL|CRITICAL)\b/i;
    const _tsRe = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

    let first: string | null = null;
    let last: string | null = null;

    for (const line of lines) {
      const _tsMatch = line?.match(tsRe);
      if (tsMatch) {
        if (!first) first = tsMatch[0];
        last = tsMatch[0];
      }
      const _level = (line?.match(levelRe)?.[1] ?? "UNKNOWN").toUpperCase();
      counts[level] = (counts[level] ?? 0) + 1;

      if (level === "ERROR" || level === "FATAL") {
        if (errors?.length < 20) errors?.push(line?.substring(0, 300));
      }
      if (samples?.length < 5 && (level === "INFO" || level === "WARN")) {
        samples?.push(line?.substring(0, 200));
      }
    }

    const _summary = {
      _type: "log-archive",
      lineCount: lines?.length,
      timeRange: { first, last },
      levelCounts: counts,
      topErrors: errors,
      sampleLines: samples,
    };

    const _out = Buffer?.from(JSON?.stringify(summary, null, 2), "utf8");
    return {
      data: out,
      originalBytes: data?.length,
      archivedBytes: out?.length,
      ratio: data?.length / out?.length,
      summary: { type: "log-archive", lines: lines?.length },
    };
  }

  private archiveMetrics(data: Buffer): ArchiveResult {
    const _text = data?.toString("utf8");
    const _lines = text
      .split("\n")
      .filter((l) => l?.trim() && !l?.startsWith("#"));

    const series: Record<string, number[]> = {};

    for (const line of lines) {
      const _parts = line?.split(/\s+/);
      if (parts?.length < 2) continue;
      const _name = parts[0].replace(/\{[^}]*\}/, "");
      const _value = parseFloat(parts[1]);
      if (!isNaN(value)) {
        if (!series[name]) series[name] = [];
        series[name].push(value);
      }
    }

    const aggregated: Record<string, any> = {};
    for (const [name, values] of Object?.entries(series)) {
      const _sorted = [...values].sort((a, b) => a - b);
      const _sum = values?.reduce((a, b) => a + b, 0);
      aggregated[name] = {
        count: values?.length,
        min: sorted[0],
        max: sorted[sorted?.length - 1],
        mean: sum / values?.length,
        p50: sorted[Math?.floor(values?.length * 0?.5)],
        p95: sorted[Math?.floor(values?.length * 0?.95)],
        p99: sorted[Math?.floor(values?.length * 0?.99)],
        last: values[values?.length - 1],
      };
    }

    const _out = Buffer?.from(
      JSON?.stringify({ _type: "metrics-archive", series: aggregated }, null, 2),
      "utf8",
    );
    return {
      data: out,
      originalBytes: data?.length,
      archivedBytes: out?.length,
      ratio: data?.length / out?.length,
      summary: {
        type: "metrics-archive",
        seriesCount: Object?.keys(aggregated).length,
      },
    };
  }

  private archiveText(data: Buffer): ArchiveResult {
    const _text = data?.toString("utf8");
    const _words = text?.split(/\s+/).filter(Boolean);
    const _sentences = text?.split(/[.!?]+/).filter((s) => s?.trim().length > 20);

    const wordFreq: Record<string, number> = {};
    for (const w of words) {
      const _clean = w?.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (clean?.length > 3) wordFreq[clean] = (wordFreq[clean] ?? 0) + 1;
    }

    const _topWords = Object?.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([w, c]) => ({ word: w, count: c }));

    const _excerpt = sentences
      .slice(0, 5)
      .map((s) => s?.trim().substring(0, 200))
      .join(" ");

    const _summary = {
      _type: "text-archive",
      charCount: text?.length,
      wordCount: words?.length,
      sentenceCount: sentences?.length,
      topWords,
      excerpt,
    };

    const _out = Buffer?.from(JSON?.stringify(summary, null, 2), "utf8");
    return {
      data: out,
      originalBytes: data?.length,
      archivedBytes: out?.length,
      ratio: data?.length / out?.length,
      summary: { type: "text-archive", wordCount: words?.length },
    };
  }

  private archiveGeneric(data: Buffer): ArchiveResult {
    return {
      data,
      originalBytes: data?.length,
      archivedBytes: data?.length,
      ratio: 1,
      summary: { type: "passthrough" },
    };
  }
}

export const _semanticArchiver = new SemanticArchiver();
