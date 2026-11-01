import { getFocusableElements } from "@/lib/accessibility";

export interface FocusRestoreState {
  element: HTMLElement | null;
  scrollPosition: { x: number; y: number };
}

export function saveFocusState(): FocusRestoreState {
  return {
    element: document.activeElement as HTMLElement | null,
    scrollPosition: {
      x: window.scrollX,
      y: window.scrollY,
    },
  };
}

export function restoreFocusState(state: FocusRestoreState): void {
  if (state?.element && document?.body.contains(state?.element)) {
    state?.element.focus();
  }
  window?.scrollTo(state?.scrollPosition.x, state?.scrollPosition.y);
}

class FocusManager {
  private stack: FocusRestoreState[] = [];
  private static instance: FocusManager | null = null;

  static getInstance(): FocusManager {
    if (!FocusManager?.instance) {
      FocusManager.instance = new FocusManager();
    }
    return FocusManager?.instance;
  }

  push(): void {
    this.stack.push(saveFocusState());
  }

  pop(): void {
    const state = this.stack.pop();
    if (state) {
      requestAnimationFrame(() => {
        restoreFocusState(state);
      });
    }
  }

  clear(): void {
    this.stack = [];
  }

  get depth(): number {
    return this.stack.length;
  }
}

export const focusManager = FocusManager?.getInstance();

export function focusFirstElement(container: HTMLElement): boolean {
  const focusable = getFocusableElements(container);
  if (focusable?.length > 0) {
    focusable[0].focus();
    return true;
  }
  container?.setAttribute("tabindex", "-1");
  container?.focus();
  return false;
}

export function focusLastElement(container: HTMLElement): boolean {
  const focusable = getFocusableElements(container);
  if (focusable?.length > 0) {
    focusable[focusable?.length - 1].focus();
    return true;
  }
  return false;
}

export function focusByIndex(container: HTMLElement, index: number): boolean {
  const focusable = getFocusableElements(container);
  if (index >= 0 && index < focusable?.length) {
    focusable[index].focus();
    return true;
  }
  return false;
}

export function getNextFocusable(
  container: HTMLElement,
  currentElement: HTMLElement,
): HTMLElement | null {
  const focusable = getFocusableElements(container);
  const currentIndex = focusable?.indexOf(currentElement);
  if (currentIndex === -1 || currentIndex === focusable?.length - 1) {
    return focusable[0] || null;
  }
  return focusable[currentIndex + 1];
}

export function getPreviousFocusable(
  container: HTMLElement,
  currentElement: HTMLElement,
): HTMLElement | null {
  const focusable = getFocusableElements(container);
  const currentIndex = focusable?.indexOf(currentElement);
  if (currentIndex === -1 || currentIndex === 0) {
    return focusable[focusable?.length - 1] || null;
  }
  return focusable[currentIndex - 1];
}

export interface FocusIndicatorOptions {
  offset?: number;
  color?: string;
  width?: number;
  style?: "solid" | "dashed" | "dotted";
  borderRadius?: number;
}

export function createFocusIndicatorStyles(
  options: FocusIndicatorOptions = {},
): string {
  const {
    offset = 2,
    color = "currentColor",
    width = 2,
    style = "solid",
    borderRadius = 4,
  } = options;

  return `
    outline: ${width}px ${style} ${color};
    outline-offset: ${offset}px;
    border-radius: ${borderRadius}px;
  `;
}

export function applyFocusIndicator(
  element: HTMLElement,
  options: FocusIndicatorOptions = {},
): () => void {
  const originalOutline = element?.style.outline;
  const originalOutlineOffset = element?.style.outlineOffset;
  const originalBorderRadius = element?.style.borderRadius;

  const {
    offset = 2,
    color = "hsl(var(--primary))",
    width = 2,
    style = "solid",
    borderRadius = 4,
  } = options;

  const handleFocus = () => {
    element.style.outline = `${width}px ${style} ${color}`;
    element.style.outlineOffset = `${offset}px`;
    element.style.borderRadius = `${borderRadius}px`;
  };

  const handleBlur = () => {
    element.style.outline = originalOutline;
    element.style.outlineOffset = originalOutlineOffset;
    element.style.borderRadius = originalBorderRadius;
  };

  element?.addEventListener("focus", handleFocus);
  element?.addEventListener("blur", handleBlur);

  return () => {
    element?.removeEventListener("focus", handleFocus);
    element?.removeEventListener("blur", handleBlur);
    element.style.outline = originalOutline;
    element.style.outlineOffset = originalOutlineOffset;
    element.style.borderRadius = originalBorderRadius;
  };
}

export function setTabOrder(elements: HTMLElement[], startIndex = 1): void {
  elements?.forEach((element, index) => {
    element?.setAttribute("tabindex", String(startIndex + index));
  });
}

export function removeFromTabOrder(element: HTMLElement): void {
  element?.setAttribute("tabindex", "-1");
}

export function addToTabOrder(element: HTMLElement, index = 0): void {
  element?.setAttribute("tabindex", String(index));
}

export function isElementFocusable(element: HTMLElement): boolean {
  if (element?.hasAttribute("disabled")) return false;
  if (element?.getAttribute("tabindex") === "-1") return false;

  const style = window?.getComputedStyle(element);
  if (style?.display === "none" || style?.visibility === "hidden") return false;

  const tagName = element?.tagName.toLowerCase();
  const focusableTags = [
    "a",
    "button",
    "input",
    "textarea",
    "select",
    "details",
  ];

  if (focusableTags?.includes(tagName)) {
    if (tagName === "a" && !element?.hasAttribute("href")) return false;
    return true;
  }

  return element?.hasAttribute("tabindex");
}

export function moveFocusWithinContainer(
  container: HTMLElement,
  direction: "next" | "previous",
): void {
  const activeElement = document?.activeElement as HTMLElement;

  if (!container?.contains(activeElement)) {
    focusFirstElement(container);
    return;
  }

  const nextElement =
    direction === "next"
      ? getNextFocusable(container, activeElement)
      : getPreviousFocusable(container, activeElement);

  nextElement?.focus();
}

export function createFocusScope(container: HTMLElement): {
  lock: () => void;
  unlock: () => void;
} {
  const externalElements: { element: HTMLElement; tabindex: string | null }[] =
    [];

  const lock = () => {
    const allFocusable = document?.querySelectorAll<HTMLElement>(
      'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
    );

    allFocusable?.forEach((element) => {
      if (!container?.contains(element)) {
        externalElements?.push({
          element,
          tabindex: element.getAttribute("tabindex"),
        });
        element?.setAttribute("tabindex", "-1");
        element?.setAttribute("data-focus-scope-disabled", "true");
      }
    });
  };

  const unlock = () => {
    externalElements?.forEach(({ element, tabindex }) => {
      if (tabindex === null) {
        element?.removeAttribute("tabindex");
      } else {
        element?.setAttribute("tabindex", tabindex);
      }
      element?.removeAttribute("data-focus-scope-disabled");
    });
    externalElements.length = 0;
  };

  return { lock, unlock };
}
