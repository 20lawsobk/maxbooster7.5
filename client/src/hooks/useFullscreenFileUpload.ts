import { useCallback, useRef, useEffect } from 'react';

interface UseFullscreenFileUploadOptions {
  onFilesSelected?: (files: FileList) => void;
  accept?: string;
  multiple?: boolean;
}

export function useFullscreenFileUpload(options: UseFullscreenFileUploadOptions = {}) {
  const { onFilesSelected, accept = '*', multiple = true } = options;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wasFullscreenRef = useRef(false);
  const fullscreenElementRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!fileInputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';
      input.accept = accept;
      input.multiple = multiple;
      document.body.appendChild(input);
      fileInputRef.current = input;
    }

    const input = fileInputRef.current;

    const handleChange = () => {
      if (input.files && input.files.length > 0) {
        onFilesSelected?.(input.files);
      }

      if (wasFullscreenRef.current && fullscreenElementRef.current) {
        setTimeout(() => {
          try {
            fullscreenElementRef.current?.requestFullscreen?.();
          } catch (e) {
            console.warn('Could not re-enter fullscreen:', e);
          }
          wasFullscreenRef.current = false;
          fullscreenElementRef.current = null;
        }, 100);
      }

      input.value = '';
    };

    input.addEventListener('change', handleChange);

    return () => {
      input.removeEventListener('change', handleChange);
    };
  }, [accept, multiple, onFilesSelected]);

  const openFilePicker = useCallback(async () => {
    if (!fileInputRef.current) return;

    const isInFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );

    if (isInFullscreen) {
      wasFullscreenRef.current = true;
      fullscreenElementRef.current = document.fullscreenElement;

      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      } catch (e) {
        console.warn('Could not exit fullscreen:', e);
      }

      setTimeout(() => {
        fileInputRef.current?.click();
      }, 150);
    } else {
      fileInputRef.current.click();
    }
  }, []);

  const cleanup = useCallback(() => {
    if (fileInputRef.current && document.body.contains(fileInputRef.current)) {
      document.body.removeChild(fileInputRef.current);
      fileInputRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    openFilePicker,
    isFullscreen: !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    ),
  };
}

export function isInFullscreenMode(): boolean {
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  );
}

export async function exitFullscreenForUpload(): Promise<Element | null> {
  const fullscreenElement = document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement;

  if (!fullscreenElement) return null;

  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      await (document as any).webkitExitFullscreen();
    } else if ((document as any).mozCancelFullScreen) {
      await (document as any).mozCancelFullScreen();
    } else if ((document as any).msExitFullscreen) {
      await (document as any).msExitFullscreen();
    }
  } catch (e) {
    console.warn('Could not exit fullscreen:', e);
  }

  return fullscreenElement;
}

export async function reenterFullscreen(element: Element | null): Promise<void> {
  if (!element) return;

  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen();
    } else if ((element as any).webkitRequestFullscreen) {
      await (element as any).webkitRequestFullscreen();
    } else if ((element as any).mozRequestFullScreen) {
      await (element as any).mozRequestFullScreen();
    } else if ((element as any).msRequestFullscreen) {
      await (element as any).msRequestFullscreen();
    }
  } catch (e) {
    console.warn('Could not re-enter fullscreen:', e);
  }
}
