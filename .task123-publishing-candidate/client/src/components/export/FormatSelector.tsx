import { memo } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  FileAudio,
  FileSpreadsheet,
  FileText,
  File,
  Image,
  Archive,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AudioFormat = "wav" | "mp3" | "flac" | "aiff" | "ogg" | "aac";
export type DataFormat = "csv" | "pdf" | "xlsx" | "json" | "png" | "svg";
export type ReportFormat = "pdf" | "xlsx" | "csv";

export interface FormatOption<T extends string> {
  value: T;
  label: string;
  description: string;
  icon?: React.ElementType;
  lossless?: boolean;
  recommended?: boolean;
  disabled?: boolean;
}

interface FormatSelectorProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: FormatOption<T>[];
  type?: "audio" | "data" | "report" | "image";
  label?: string;
  columns?: 2 | 3 | 4 | 6;
  className?: string;
  compact?: boolean;
}

export const AUDIO_FORMATS: FormatOption<AudioFormat>[] = [
  {
    value: "wav",
    label: "WAV",
    description: "Uncompressed audio (lossless)",
    icon: FileAudio,
    lossless: true,
    recommended: true,
  },
  {
    value: "mp3",
    label: "MP3",
    description: "Compressed audio (lossy)",
    icon: FileAudio,
    lossless: false,
  },
  {
    value: "flac",
    label: "FLAC",
    description: "Lossless compression",
    icon: FileAudio,
    lossless: true,
  },
  {
    value: "aiff",
    label: "AIFF",
    description: "Apple lossless format",
    icon: FileAudio,
    lossless: true,
  },
  {
    value: "ogg",
    label: "OGG",
    description: "Open format (lossy)",
    icon: FileAudio,
    lossless: false,
  },
  {
    value: "aac",
    label: "AAC",
    description: "Advanced Audio Coding",
    icon: FileAudio,
    lossless: false,
  },
];

export const DATA_FORMATS: FormatOption<DataFormat>[] = [
  {
    value: "csv",
    label: "CSV",
    description: "Spreadsheet compatible",
    icon: FileSpreadsheet,
    recommended: true,
  },
  {
    value: "xlsx",
    label: "Excel",
    description: "Full Excel workbook",
    icon: FileSpreadsheet,
  },
  {
    value: "pdf",
    label: "PDF",
    description: "Print-ready report",
    icon: FileText,
  },
  {
    value: "json",
    label: "JSON",
    description: "Raw data format",
    icon: Database,
  },
  {
    value: "png",
    label: "PNG",
    description: "Chart image export",
    icon: Image,
  },
  {
    value: "svg",
    label: "SVG",
    description: "Vector chart export",
    icon: Image,
  },
];

export const REPORT_FORMATS: FormatOption<ReportFormat>[] = [
  {
    value: "pdf",
    label: "PDF",
    description: "Print-ready document",
    icon: FileText,
    recommended: true,
  },
  {
    value: "xlsx",
    label: "Excel",
    description: "Editable spreadsheet",
    icon: FileSpreadsheet,
  },
  {
    value: "csv",
    label: "CSV",
    description: "Data only (no formatting)",
    icon: FileSpreadsheet,
  },
];

function FormatSelectorInner<T extends string>({
  value,
  onChange,
  options,
  label,
  columns = 3,
  className,
  compact = false,
}: FormatSelectorProps<T>) {
  const gridClasses = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    6: "grid-cols-6",
  };

  return (
    <div className={cn("space-y-3", className)}>
      {label && (
        <Label className="text-sm font-medium text-zinc-300">{label}</Label>
      )}
      <div className={cn("grid gap-2", gridClasses[columns])}>
        {options.map((option) => {
          const Icon = option.icon || File;
          const isSelected = value === option.value;

          return (
            <motion.button
              key={option.value}
              type="button"
              disabled={option.disabled}
              onClick={() => onChange(option.value)}
              whileHover={{ scale: option.disabled ? 1 : 1.02 }}
              whileTap={{ scale: option.disabled ? 1 : 0.98 }}
              className={cn(
                "relative text-left rounded-lg border transition-all",
                compact ? "p-2" : "p-3",
                isSelected
                  ? "bg-blue-600/20 border-blue-500 ring-1 ring-blue-500"
                  : "bg-zinc-900 border-zinc-700 hover:border-zinc-600",
                option.disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              {option.recommended && !isSelected && (
                <div className="absolute -top-1 -right-1">
                  <span className="flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                </div>
              )}

              {compact ? (
                <div className="flex items-center justify-center gap-1.5">
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isSelected ? "text-blue-400" : "text-zinc-400",
                    )}
                  />
                  <span className="font-medium text-sm">{option.label}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Icon
                        className={cn(
                          "h-4 w-4",
                          isSelected ? "text-blue-400" : "text-zinc-400",
                        )}
                      />
                      <span className="font-medium text-sm">
                        {option.label}
                      </span>
                    </div>
                    {option.lossless && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 bg-green-900/30 text-green-400"
                      >
                        Lossless
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-500 line-clamp-1">
                    {option.description}
                  </p>
                </>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export const FormatSelector = memo(
  FormatSelectorInner,
) as typeof FormatSelectorInner;

export interface ChartExportFormat {
  format: "png" | "svg" | "pdf";
  resolution?: "standard" | "high" | "ultra";
  background?: "transparent" | "white" | "dark";
}

interface ChartFormatSelectorProps {
  value: ChartExportFormat;
  onChange: (value: ChartExportFormat) => void;
  className?: string;
}

export const ChartFormatSelector = memo(function ChartFormatSelector({
  value,
  onChange,
  className,
}: ChartFormatSelectorProps) {
  const formatOptions: FormatOption<"png" | "svg" | "pdf">[] = [
    {
      value: "png",
      label: "PNG",
      description: "Raster image",
      icon: Image,
      recommended: true,
    },
    { value: "svg", label: "SVG", description: "Vector image", icon: Image },
    { value: "pdf", label: "PDF", description: "Document", icon: FileText },
  ];

  const resolutionOptions = [
    { value: "standard", label: "1x", description: "Standard (72 DPI)" },
    { value: "high", label: "2x", description: "High (144 DPI)" },
    { value: "ultra", label: "4x", description: "Ultra (288 DPI)" },
  ];

  const backgroundOptions = [
    { value: "transparent", label: "Transparent" },
    { value: "white", label: "White" },
    { value: "dark", label: "Dark" },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      <FormatSelector
        value={value.format}
        onChange={(format) => onChange({ ...value, format })}
        options={formatOptions}
        label="Chart Format"
        columns={3}
        compact
      />

      {value.format === "png" && (
        <div className="space-y-2">
          <Label className="text-xs text-zinc-400">Resolution</Label>
          <div className="flex gap-2">
            {resolutionOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    resolution: opt.value as ChartExportFormat["resolution"],
                  })
                }
                className={cn(
                  "flex-1 p-2 rounded-lg border text-center transition-all",
                  value.resolution === opt.value
                    ? "bg-blue-600/20 border-blue-500"
                    : "bg-zinc-900 border-zinc-700 hover:border-zinc-600",
                )}
              >
                <span className="font-medium text-sm">{opt.label}</span>
                <p className="text-[10px] text-zinc-500">{opt.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {(value.format === "png" || value.format === "svg") && (
        <div className="space-y-2">
          <Label className="text-xs text-zinc-400">Background</Label>
          <div className="flex gap-2">
            {backgroundOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    background: opt.value as ChartExportFormat["background"],
                  })
                }
                className={cn(
                  "flex-1 p-2 rounded-lg border text-sm font-medium transition-all",
                  value.background === opt.value
                    ? "bg-blue-600/20 border-blue-500"
                    : "bg-zinc-900 border-zinc-700 hover:border-zinc-600",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export interface BulkFormatConfig {
  useUnifiedFormat: boolean;
  format?: AudioFormat;
  individualFormats?: Record<string, AudioFormat>;
  zipCompression: boolean;
}

interface BulkFormatSelectorProps {
  value: BulkFormatConfig;
  onChange: (value: BulkFormatConfig) => void;
  itemCount: number;
  className?: string;
}

export const BulkFormatSelector = memo(function BulkFormatSelector({
  value,
  onChange,
  itemCount,
  className,
}: BulkFormatSelectorProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800">
        <div>
          <p className="font-medium text-sm">Unified Format</p>
          <p className="text-xs text-zinc-500">
            Export all {itemCount} items in the same format
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange({ ...value, useUnifiedFormat: !value.useUnifiedFormat })
          }
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            value.useUnifiedFormat ? "bg-blue-600" : "bg-zinc-700",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
              value.useUnifiedFormat ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </div>

      {value.useUnifiedFormat && (
        <FormatSelector
          value={value.format || "wav"}
          onChange={(format) => onChange({ ...value, format })}
          options={AUDIO_FORMATS}
          label="Export Format"
          columns={3}
        />
      )}

      <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800">
        <div className="flex items-center gap-3">
          <Archive className="h-5 w-5 text-purple-400" />
          <div>
            <p className="font-medium text-sm">ZIP Compression</p>
            <p className="text-xs text-zinc-500">
              Bundle all exports in a single download
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange({ ...value, zipCompression: !value.zipCompression })
          }
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            value.zipCompression ? "bg-blue-600" : "bg-zinc-700",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
              value.zipCompression ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </div>
    </div>
  );
});

export default FormatSelector;
