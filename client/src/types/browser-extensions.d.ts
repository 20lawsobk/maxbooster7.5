interface FileSystemFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
}

interface FileSystemOpenPickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

interface Window {
  showOpenFilePicker(options?: FileSystemOpenPickerOptions): Promise<FileSystemFileHandle[]>;
}

interface Document {
  readonly webkitFullscreenElement: Element | null;
  readonly mozFullScreenElement: Element | null;
  readonly msFullscreenElement: Element | null;
  webkitExitFullscreen(): Promise<void>;
  mozCancelFullScreen(): Promise<void>;
  msExitFullscreen(): Promise<void>;
}

interface Element {
  webkitRequestFullscreen(options?: FullscreenOptions): Promise<void>;
  mozRequestFullScreen(options?: FullscreenOptions): Promise<void>;
  msRequestFullscreen(options?: FullscreenOptions): Promise<void>;
}
