import { logger } from "../lib/logger";
import { useCallback, useRef, useEffect } from "react";

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface UseFullscreenFileUploadOptions {
  onFilesSelected?: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
}

function supportsFileSystemAccess(): boolean {
  return "showOpenFilePicker" in window;
}

function parseAcceptToFileTypes(accept: string): FilePickerAcceptType[] {
  if (accept === "*" || accept === "*/*") {
    return [];
  }

  const types: FilePickerAcceptType[] = [];
  const parts = accept?.split(",").map((p) => p?.trim());

  const audioExtensions: string[] = [];
  const mimeTypes: Record<string, string[]> = {};

  for (const part of parts) {
    if (part?.startsWith(".")) {
      audioExtensions?.push(part);
    } else if (part?.includes("/")) {
      const [category] = part?.split("/") ?? [];
      if (!mimeTypes[part]) {
        mimeTypes[part] = [];
      }
      if (category === "audio") {
        const ext = part?.split("/")[1];
        if (ext && ext !== "*") {
          mimeTypes[part].push(`.${ext}`);
        }
      }
    }
  }

  if (audioExtensions?.length > 0 || Object.keys(mimeTypes).length > 0) {
    const acceptObj: Record<string, string[]> = {};

    if (audioExtensions?.length > 0) {
      acceptObj["audio/*"] = audioExtensions;
    }

    for (const [mime, exts] of Object.entries(mimeTypes)) {
      if (exts?.length > 0) {
        acceptObj[mime] = exts;
      } else {
        acceptObj[mime] = audioExtensions?.length > 0 ? audioExtensions : [];
      }
    }

    if (Object.keys(acceptObj).length > 0) {
      types?.push({
        description: "Audio Files",
        accept: acceptObj,
      });
    }
  }

  return types;
}

export function useFullscreenFileUpload(
  options: UseFullscreenFileUploadOptions = {},
) {
  const { onFilesSelected, accept = "*", multiple = true } = options;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wasFullscreenRef = useRef(false);
  const fullscreenElementRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!fileInputRef?.current) {
      const input = document.createElement("input");
      input.type = "file";
      input.style.display = "none";
      input.accept = accept;
      input.multiple = multiple;
      document.body.appendChild(input);
      fileInputRef.current = input;
    }

    const input = fileInputRef?.current;

    const handleChange = () => {
      if (input?.files && input?.files.length > 0) {
        onFilesSelected?.(Array.from(input?.files));
      }

      if (wasFullscreenRef?.current && fullscreenElementRef?.current) {
        setTimeout(() => {
          try {
            fullscreenElementRef?.current?.requestFullscreen?.();
          } catch (e) {
            logger.warn("Could not re-enter fullscreen:", e);
          }
          wasFullscreenRef.current = false;
          fullscreenElementRef.current = null;
        }, 100);
      }

      input.value = "";
    };

    input?.addEventListener("change", handleChange);

    return () => {
      input?.removeEventListener("change", handleChange);
    };
  }, [accept, multiple, onFilesSelected]);

  const openFilePicker = useCallback(async () => {
    const isInFullscreen = isInFullscreenMode();

    if (supportsFileSystemAccess() && isInFullscreen) {
      try {
        const fileTypes = parseAcceptToFileTypes(accept);
        const handles = await window.showOpenFilePicker({
          multiple,
          types: fileTypes.length > 0 ? fileTypes : undefined,
          excludeAcceptAllOption: false,
        });

        const files: File[] = [];
        for (const handle of handles) {
          const file = await handle?.getFile();
          files?.push(file);
        }

        if (files?.length > 0) {
          onFilesSelected?.(files);
        }
        return;
      } catch (e) {
        if (e instanceof Error && e?.name === "AbortError") {
          return;
        }
        logger.warn("File System Access API failed, falling back:", e);
      }
    }

    if (!fileInputRef?.current) return;

    if (isInFullscreen) {
      wasFullscreenRef.current = true;
      fullscreenElementRef.current = document.fullscreenElement;

      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
      } catch (e) {
        logger.warn("Could not exit fullscreen:", e);
      }

      setTimeout(() => {
        fileInputRef?.current?.click();
      }, 150);
    } else {
      fileInputRef?.current.click();
    }
  }, [accept, multiple, onFilesSelected]);

  const cleanup = useCallback(() => {
    if (fileInputRef?.current && document.body.contains(fileInputRef?.current)) {
      document.body.removeChild(fileInputRef?.current);
      fileInputRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    openFilePicker,
    isFullscreen: isInFullscreenMode(),
    supportsFullscreenFilePicker: supportsFileSystemAccess(),
  };
}

export function isInFullscreenMode(): boolean {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

export async function exitFullscreenForUpload(): Promise<Element | null> {
  const fullscreenElement =
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement;

  if (!fullscreenElement) return null;

  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      await document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      await document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      await document.msExitFullscreen();
    }
  } catch (e) {
    logger.warn("Could not exit fullscreen:", e);
  }

  return fullscreenElement;
}

export async function reenterFullscreen(
  element: Element | null,
): Promise<void> {
  if (!element) return;

  try {
    if (element?.requestFullscreen) {
      await element?.requestFullscreen();
    } else if (element?.webkitRequestFullscreen) {
      await element?.webkitRequestFullscreen();
    } else if (element?.mozRequestFullScreen) {
      await element?.mozRequestFullScreen();
    } else if (element?.msRequestFullscreen) {
      await element?.msRequestFullscreen();
    }
  } catch (e) {
    logger.warn("Could not re-enter fullscreen:", e);
  }
}

export async function openFilePickerInFullscreen(options: {
  accept?: string;
  multiple?: boolean;
}): Promise<File[]> {
  const { accept = "*", multiple = true } = options;

  if (supportsFileSystemAccess()) {
    try {
      const fileTypes = parseAcceptToFileTypes(accept);
      const handles = await window.showOpenFilePicker({
        multiple,
        types: fileTypes.length > 0 ? fileTypes : undefined,
        excludeAcceptAllOption: false,
      });

      const files: File[] = [];
      for (const handle of handles) {
        const file = await handle?.getFile();
        files?.push(file);
      }
      return files;
    } catch (e) {
      if (e instanceof Error && e?.name === "AbortError") {
        return [];
      }
      throw e;
    }
  }

  throw new Error("File System Access API not supported");
}

export function canPickFilesInFullscreen(): boolean {
  return supportsFileSystemAccess();
}
