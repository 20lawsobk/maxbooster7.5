import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, AlertTriangle, FileAudio, File, Shield, HardDrive, Ruler, FileType, Loader2 } from "lucide-react";

export interface ValidationOptions {
  maxSize?: number;
  minSize?: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
  audioFormats?: string[];
  imageMinWidth?: number;
  imageMinHeight?: number;
  imageMaxWidth?: number;
  imageMaxHeight?: number;
  checkCorruption?: boolean;
  virusScan?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: ValidationDetail[];
}

export interface ValidationDetail {
  check: string;
  status: "pass" | "fail" | "warning" | "pending" | "skipped";
  message: string;
  value?: string | number;
}

const DEFAULT_AUDIO_FORMATS = [
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp3",
  "audio/mpeg",
  "audio/flac",
  "audio/x-flac",
  "audio/aiff",
  "audio/x-aiff",
  "audio/ogg",
  "audio/webm",
  "audio/aac",
  "audio/mp4",
];

const DEFAULT_IMAGE_FORMATS = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];


function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getFileExtension(filename: string): string {
  return "." + filename.split(".").pop()?.toLowerCase() || "";
}

async function checkImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return null;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

async function checkAudioFile(
  file: File,
): Promise<{ duration: number } | null> {
  if (!file.type.startsWith("audio/")) return null;

  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);

    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ duration: audio.duration });
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    audio.src = url;
  });
}

async function checkFileHeader(file: File): Promise<boolean> {
  const MAGIC_NUMBERS: Record<string, number[]> = {
    "audio/wav": [0x52, 0x49, 0x46, 0x46],
    "audio/mp3": [0xff, 0xfb],
    "audio/mpeg": [0xff, 0xfb],
    "audio/flac": [0x66, 0x4c, 0x61, 0x43],
    "audio/ogg": [0x4f, 0x67, 0x67, 0x53],
    "image/png": [0x89, 0x50, 0x4e, 0x47],
    "image/jpeg": [0xff, 0xd8, 0xff],
    "image/gif": [0x47, 0x49, 0x46, 0x38],
    "image/webp": [0x52, 0x49, 0x46, 0x46],
  };

  const magicBytes = MAGIC_NUMBERS[file.type];
  if (!magicBytes) return true;

  const buffer = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (file.type === "audio/mp3" || file.type === "audio/mpeg") {
    if (
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) ||
      (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
    ) {
      return true;
    }
    return false;
  }

  for (let i = 0; i < magicBytes.length; i++) {
    if (bytes[i] !== magicBytes[i]) return false;
  }

  return true;
}

export class FileValidator {
  static validate(
    file: File,
    options: ValidationOptions = {},
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details: ValidationDetail[] = [];

    const {
      maxSize = 500 * 1024 * 1024,
      minSize = 0,
      allowedTypes = [...DEFAULT_AUDIO_FORMATS, ...DEFAULT_IMAGE_FORMATS],
      allowedExtensions = [
        ".wav",
        ".mp3",
        ".flac",
        ".aiff",
        ".aif",
        ".ogg",
        ".webm",
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
      ],
    } = options;

    if (file.size > maxSize) {
      errors.push(
        `File size (${formatBytes(file.size)}) exceeds maximum allowed (${formatBytes(maxSize)})`,
      );
      details.push({
        check: "File Size",
        status: "fail",
        message: `File is too large`,
        value: `${formatBytes(file.size)} / ${formatBytes(maxSize)} max`,
      });
    } else if (file.size < minSize) {
      errors.push(
        `File size (${formatBytes(file.size)}) is below minimum required (${formatBytes(minSize)})`,
      );
      details.push({
        check: "File Size",
        status: "fail",
        message: `File is too small`,
        value: `${formatBytes(file.size)} / ${formatBytes(minSize)} min`,
      });
    } else {
      details.push({
        check: "File Size",
        status: "pass",
        message: `Within size limits`,
        value: formatBytes(file.size),
      });
    }

    const extension = getFileExtension(file.name);
    const typeAllowed = allowedTypes.some((t) => {
      if (t.endsWith("/*")) {
        return file.type.startsWith(t.replace("/*", "/"));
      }
      return file.type === t;
    });
    const extensionAllowed = allowedExtensions.includes(extension);

    if (!typeAllowed && !extensionAllowed) {
      errors.push(`File type "${file.type || extension}" is not supported`);
      details.push({
        check: "File Type",
        status: "fail",
        message: `Unsupported file type`,
        value: file.type || extension,
      });
    } else {
      details.push({
        check: "File Type",
        status: "pass",
        message: `Supported file format`,
        value: file.type || extension,
      });
    }

    if (file.type.startsWith("audio/")) {
      const audioFormats = options.audioFormats || DEFAULT_AUDIO_FORMATS;
      if (!audioFormats.includes(file.type)) {
        warnings.push(`Audio format "${file.type}" may not be fully supported`);
        details.push({
          check: "Audio Format",
          status: "warning",
          message: `Format may have limited support`,
          value: file.type,
        });
      } else {
        details.push({
          check: "Audio Format",
          status: "pass",
          message: `Supported audio format`,
          value: file.type,
        });
      }
    }

    details.push({
      check: "File Integrity",
      status: "pending",
      message: "Will be verified during upload",
    });

    if (options.virusScan) {
      details.push({
        check: "Security Scan",
        status: "pending",
        message: "Will be scanned during upload",
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details,
    };
  }

  static async validateAsync(
    file: File,
    options: ValidationOptions = {},
  ): Promise<ValidationResult> {
    const result = this.validate(file, options);

    if (options.checkCorruption !== false) {
      const integrityIndex = result.details.findIndex(
        (d) => d.check === "File Integrity",
      );
      try {
        const isValid = await checkFileHeader(file);
        if (isValid) {
          result.details[integrityIndex] = {
            check: "File Integrity",
            status: "pass",
            message: "File header verified",
          };
        } else {
          result.details[integrityIndex] = {
            check: "File Integrity",
            status: "fail",
            message: "File appears to be corrupted or invalid",
          };
          result.errors.push(
            "File integrity check failed - file may be corrupted",
          );
          result.valid = false;
        }
      } catch {
        result.details[integrityIndex] = {
          check: "File Integrity",
          status: "warning",
          message: "Could not verify file integrity",
        };
        result.warnings.push("Could not verify file integrity");
      }
    }

    if (
      file.type.startsWith("image/") &&
      (options.imageMinWidth ||
        options.imageMinHeight ||
        options.imageMaxWidth ||
        options.imageMaxHeight)
    ) {
      const dimensions = await checkImageDimensions(file);
      if (dimensions) {
        let dimensionOk = true;
        const issues: string[] = [];

        if (options.imageMinWidth && dimensions.width < options.imageMinWidth) {
          issues.push(
            `width ${dimensions.width}px < ${options.imageMinWidth}px min`,
          );
          dimensionOk = false;
        }
        if (
          options.imageMinHeight &&
          dimensions.height < options.imageMinHeight
        ) {
          issues.push(
            `height ${dimensions.height}px < ${options.imageMinHeight}px min`,
          );
          dimensionOk = false;
        }
        if (options.imageMaxWidth && dimensions.width > options.imageMaxWidth) {
          issues.push(
            `width ${dimensions.width}px > ${options.imageMaxWidth}px max`,
          );
          dimensionOk = false;
        }
        if (
          options.imageMaxHeight &&
          dimensions.height > options.imageMaxHeight
        ) {
          issues.push(
            `height ${dimensions.height}px > ${options.imageMaxHeight}px max`,
          );
          dimensionOk = false;
        }

        result.details.push({
          check: "Image Dimensions",
          status: dimensionOk ? "pass" : "fail",
          message: dimensionOk
            ? "Dimensions are acceptable"
            : issues.join(", "),
          value: `${dimensions.width} x ${dimensions.height}`,
        });

        if (!dimensionOk) {
          result.errors.push(`Image dimensions invalid: ${issues.join(", ")}`);
          result.valid = false;
        }
      } else {
        result.details.push({
          check: "Image Dimensions",
          status: "warning",
          message: "Could not read image dimensions",
        });
        result.warnings.push("Could not verify image dimensions");
      }
    }

    if (file.type.startsWith("audio/")) {
      const audioInfo = await checkAudioFile(file);
      if (audioInfo) {
        result.details.push({
          check: "Audio Playable",
          status: "pass",
          message: "Audio file can be played",
          value: `${Math.round(audioInfo.duration)}s duration`,
        });
      } else {
        result.details.push({
          check: "Audio Playable",
          status: "warning",
          message: "Could not verify audio playability",
        });
      }
    }

    return result;
  }

  static getAcceptString(options: ValidationOptions = {}): string {
    const types = options.allowedTypes || [
      ...DEFAULT_AUDIO_FORMATS,
      ...DEFAULT_IMAGE_FORMATS,
    ];
    const extensions = options.allowedExtensions || [
      ".wav",
      ".mp3",
      ".flac",
      ".aiff",
      ".aif",
      ".ogg",
    ];
    return [...types, ...extensions].join(",");
  }
}

interface FileValidationDisplayProps {
  result: ValidationResult;
  className?: string;
  compact?: boolean;
}

export function FileValidationDisplay({
  result,
  className,
  compact = false,
}: FileValidationDisplayProps) {
  const passCount = result.details.filter((d) => d.status === "pass").length;
  const failCount = result.details.filter((d) => d.status === "fail").length;
  const warningCount = result.details.filter(
    (d) => d.status === "warning",
  ).length;
  const pendingCount = result.details.filter(
    (d) => d.status === "pending",
  ).length;

  const statusIcons = {
    pass: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    fail: <XCircle className="h-4 w-4 text-destructive" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    pending: <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />,
    skipped: <div className="h-4 w-4 rounded-full bg-muted" />,
  };

  const checkIcons: Record<string, React.ReactNode> = {
    "File Size": <HardDrive className="h-4 w-4" />,
    "File Type": <FileType className="h-4 w-4" />,
    "Audio Format": <FileAudio className="h-4 w-4" />,
    "Image Dimensions": <Ruler className="h-4 w-4" />,
    "File Integrity": <Shield className="h-4 w-4" />,
    "Security Scan": <Shield className="h-4 w-4" />,
    "Audio Playable": <FileAudio className="h-4 w-4" />,
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {result.valid ? (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Valid
          </Badge>
        ) : (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            {failCount} issue{failCount > 1 ? "s" : ""}
          </Badge>
        )}
        {warningCount > 0 && (
          <Badge variant="outline" className="text-amber-600 border-amber-600">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {warningCount} warning{warningCount > 1 ? "s" : ""}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Validation Results</CardTitle>
          <div className="flex items-center gap-2">
            {result.valid ? (
              <Badge
                variant="outline"
                className="text-green-600 border-green-600"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Valid
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" />
                Invalid
              </Badge>
            )}
          </div>
        </div>
        <Progress
          value={(passCount / ((result.details.length - pendingCount || 1))) * 100}
          className="h-1.5 mt-2"
        />
      </CardHeader>
      <CardContent className="pt-2">
        <div className="space-y-2">
          {result.details.map((detail, index) => (
            <div key={index} className="flex items-start gap-3 py-1.5">
              <div className="flex-shrink-0 mt-0.5 text-muted-foreground">
                {checkIcons[detail.check] || <File className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{detail.check}</span>
                  {statusIcons[detail.status]}
                </div>
                <p
                  className={cn(
                    "text-xs",
                    detail.status === "fail"
                      ? "text-destructive"
                      : detail.status === "warning"
                        ? "text-amber-600"
                        : "text-muted-foreground",
                  )}
                >
                  {detail.message}
                </p>
                {detail.value && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    {detail.value}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {result.errors.length > 0 && (
          <div className="mt-3 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-xs font-medium text-destructive mb-1">Errors:</p>
            <ul className="text-xs text-destructive space-y-0.5">
              {result.errors.map((error, i) => (
                <li key={i}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

        {result.warnings.length > 0 && (
          <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs font-medium text-amber-600 mb-1">Warnings:</p>
            <ul className="text-xs text-amber-600 space-y-0.5">
              {result.warnings.map((warning, i) => (
                <li key={i}>• {warning}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
