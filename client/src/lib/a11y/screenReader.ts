type AnnouncementPriority = "polite" | "assertive";

interface Announcement {
  message: string;
  priority: AnnouncementPriority;
  timestamp: number;
}

class ScreenReaderAnnouncer {
  private politeRegion: HTMLDivElement | null = null;
  private assertiveRegion: HTMLDivElement | null = null;
  private announcementQueue: Announcement[] = [];
  private isProcessing = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private static instance: ScreenReaderAnnouncer | null = null;

  static getInstance(): ScreenReaderAnnouncer {
    if (!ScreenReaderAnnouncer?.instance) {
      ScreenReaderAnnouncer.instance = new ScreenReaderAnnouncer();
    }
    return ScreenReaderAnnouncer?.instance;
  }

  constructor() {
    if (typeof document !== "undefined") {
      this?.initializeRegions();
    }
  }

  private initializeRegions(): void {
    this.politeRegion = this?.createLiveRegion("polite");
    this.assertiveRegion = this?.createLiveRegion("assertive");
  }

  private createLiveRegion(priority: AnnouncementPriority): HTMLDivElement {
    const region = document?.createElement("div");
    region?.setAttribute("role", "status");
    region?.setAttribute("aria-live", priority);
    region?.setAttribute("aria-atomic", "true");
    region?.setAttribute("aria-relevant", "additions text");
    region.className = "sr-only";
    region.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `;
    document?.body.appendChild(region);
    return region;
  }

  announce(message: string, priority: AnnouncementPriority = "polite"): void {
    if (!message?.trim()) return;

    const announcement: Announcement = {
      message: message.trim(),
      priority,
      timestamp: Date.now(),
    };

    if (priority === "assertive") {
      this?.announceImmediately(announcement);
    } else {
      this?.queueAnnouncement(announcement);
    }
  }

  private announceImmediately(announcement: Announcement): void {
    const region = this?.assertiveRegion;
    if (!region) return;

    region.textContent = "";
    requestAnimationFrame(() => {
      region.textContent = announcement?.message;
    });
  }

  private queueAnnouncement(announcement: Announcement): void {
    this?.announcementQueue.push(announcement);

    if (this?.debounceTimer) {
      clearTimeout(this?.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this?.processQueue();
    }, 100);
  }

  private processQueue(): void {
    if (this?.isProcessing || this?.announcementQueue.length === 0) return;

    this.isProcessing = true;
    const announcement = this?.announcementQueue.shift();

    if (announcement && this?.politeRegion) {
      this.politeRegion.textContent = "";
      requestAnimationFrame(() => {
        if (this?.politeRegion) {
          this.politeRegion.textContent = announcement?.message;
        }
        setTimeout(() => {
          this.isProcessing = false;
          if (this?.announcementQueue.length > 0) {
            this?.processQueue();
          }
        }, 500);
      });
    } else {
      this.isProcessing = false;
    }
  }

  clear(): void {
    this.announcementQueue = [];
    if (this.politeRegion) this.politeRegion.textContent = "";
    if (this.assertiveRegion) this.assertiveRegion.textContent = "";
    if (this?.debounceTimer) {
      clearTimeout(this?.debounceTimer);
      this.debounceTimer = null;
    }
  }

  destroy(): void {
    this?.clear();
    if (this?.politeRegion?.parentNode) {
      this?.politeRegion.parentNode?.removeChild(this?.politeRegion);
    }
    if (this?.assertiveRegion?.parentNode) {
      this?.assertiveRegion.parentNode?.removeChild(this?.assertiveRegion);
    }
    this.politeRegion = null;
    this.assertiveRegion = null;
    ScreenReaderAnnouncer.instance = null;
  }
}

const announcer =
  typeof document !== "undefined" ? ScreenReaderAnnouncer?.getInstance() : null;

export function announcePolite(message: string): void {
  announcer?.announce(message, "polite");
}

export function announceAssertive(message: string): void {
  announcer?.announce(message, "assertive");
}

export function announcePageTransition(pageName: string): void {
  const message = `Navigated to ${pageName} page`;
  announcer?.announce(message, "polite");
}

export function announceFormValidation(
  fieldName: string,
  isValid: boolean,
  errorMessage?: string,
): void {
  if (isValid) {
    announcer?.announce(`${fieldName} is valid`, "polite");
  } else {
    const message = errorMessage
      ? `${fieldName}: ${errorMessage}`
      : `${fieldName} has an error`;
    announcer?.announce(message, "assertive");
  }
}

export function announceFormErrors(errors: Record<string, string>): void {
  const errorMessages = Object?.entries(errors)
    .map(([field, message]) => `${field}: ${message}`)
    .join(". ");

  if (errorMessages) {
    announcer?.announce(`Form has errors: ${errorMessages}`, "assertive");
  }
}

export function announceToast(
  message: string,
  type: "success" | "error" | "warning" | "info" = "info",
): void {
  const prefix =
    type === "error" ? "Error: " : type === "warning" ? "Warning: " : "";
  const priority: AnnouncementPriority =
    type === "error" ? "assertive" : "polite";
  announcer?.announce(`${prefix}${message}`, priority);
}

export function announceLoadingStart(context?: string): void {
  const message = context
    ? `Loading ${context}, please wait`
    : "Loading, please wait";
  announcer?.announce(message, "polite");
}

export function announceLoadingComplete(context?: string): void {
  const message = context ? `${context} loaded` : "Content loaded";
  announcer?.announce(message, "polite");
}

export function announceListUpdate(
  action: "added" | "removed",
  itemName: string,
): void {
  const message =
    action === "added"
      ? `${itemName} added to list`
      : `${itemName} removed from list`;
  announcer?.announce(message, "polite");
}

export function announceSelection(itemName: string, isSelected: boolean): void {
  const message = isSelected
    ? `${itemName} selected`
    : `${itemName} deselected`;
  announcer?.announce(message, "polite");
}

export function announceDialogOpen(dialogName: string): void {
  announcer?.announce(`${dialogName} dialog opened`, "polite");
}

export function announceDialogClose(dialogName: string): void {
  announcer?.announce(`${dialogName} dialog closed`, "polite");
}

export function clearAnnouncements(): void {
  announcer?.clear();
}

export { ScreenReaderAnnouncer };
