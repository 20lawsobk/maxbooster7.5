import { useEffect, useRef, useCallback, useState } from 'react';

export const ARIA_LIVE_REGIONS = {
  POLITE: 'polite',
  ASSERTIVE: 'assertive',
  OFF: 'off',
} as const;

export const ARIA_ROLES = {
  ALERT: 'alert',
  NAVIGATION: 'navigation',
  MAIN: 'main',
  COMPLEMENTARY: 'complementary',
  BANNER: 'banner',
  CONTENTINFO: 'contentinfo',
  SEARCH: 'search',
  BUTTON: 'button',
  LINK: 'link',
  MENU: 'menu',
  MENUITEM: 'menuitem',
  TAB: 'tab',
  TABLIST: 'tablist',
  TABPANEL: 'tabpanel',
  DIALOG: 'dialog',
  ALERTDIALOG: 'alertdialog',
  LISTBOX: 'listbox',
  OPTION: 'option',
  PROGRESSBAR: 'progressbar',
  SLIDER: 'slider',
  SPINBUTTON: 'spinbutton',
  STATUS: 'status',
  TOOLTIP: 'tooltip',
  TREE: 'tree',
  TREEITEM: 'treeitem',
  GRID: 'grid',
  GRIDCELL: 'gridcell',
  ROW: 'row',
  ROWHEADER: 'rowheader',
  COLUMNHEADER: 'columnheader',
} as const;

export const focusableElements = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  'details>summary:first-of-type',
  'details',
];

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const elements = container.querySelectorAll<HTMLElement>(focusableElements.join(','));
  return Array.from(elements).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
  });
}

export function trapFocus(container: HTMLElement): () => void {
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) return () => {};

  const firstElement = focusable[0];
  const lastElement = focusable[focusable.length - 1];

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  };

  container.addEventListener('keydown', handleKeyDown);
  setTimeout(() => firstElement?.focus(), 0);

  return () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
}

export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

export function getContrastRatio(color1: string, color2: string): number {
  const getLuminance = (color: string): number => {
    const rgb = color.match(/\d+/g);
    if (!rgb) return 0;

    const [r, g, b] = rgb.map((c) => {
      const val = parseInt(c) / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsContrastStandard(ratio: number, largeText = false): boolean {
  return largeText ? ratio >= 3 : ratio >= 4.5;
}

export function generateAriaId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

export function toggleAriaExpanded(element: HTMLElement) {
  const current = element.getAttribute('aria-expanded') === 'true';
  element.setAttribute('aria-expanded', String(!current));
}

export function createLiveRegion(priority: 'polite' | 'assertive' = 'polite'): HTMLDivElement {
  const region = document.createElement('div');
  region.setAttribute('aria-live', priority);
  region.setAttribute('aria-atomic', 'true');
  region.className = 'sr-only';
  document.body.appendChild(region);
  return region;
}

export function removeLiveRegion(region: HTMLDivElement) {
  if (region && region.parentNode) {
    region.parentNode.removeChild(region);
  }
}

export function handleArrowKeyNavigation(
  e: KeyboardEvent,
  items: HTMLElement[],
  orientation: 'horizontal' | 'vertical' = 'horizontal'
): number | null {
  const currentIndex = items.findIndex((item) => item === document.activeElement);
  if (currentIndex === -1) return null;

  let nextIndex = currentIndex;

  const isNext = orientation === 'horizontal' ? e.key === 'ArrowRight' : e.key === 'ArrowDown';
  const isPrev = orientation === 'horizontal' ? e.key === 'ArrowLeft' : e.key === 'ArrowUp';

  if (isNext) {
    nextIndex = (currentIndex + 1) % items.length;
  } else if (isPrev) {
    nextIndex = (currentIndex - 1 + items.length) % items.length;
  } else if (e.key === 'Home') {
    nextIndex = 0;
  } else if (e.key === 'End') {
    nextIndex = items.length - 1;
  } else {
    return null;
  }

  e.preventDefault();
  items[nextIndex]?.focus();
  return nextIndex;
}

export interface AriaProps {
  role?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-expanded'?: boolean;
  'aria-haspopup'?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  'aria-controls'?: string;
  'aria-hidden'?: boolean;
  'aria-disabled'?: boolean;
  'aria-pressed'?: boolean;
  'aria-selected'?: boolean;
  'aria-checked'?: boolean | 'mixed';
  'aria-current'?: boolean | 'page' | 'step' | 'location' | 'date' | 'time';
  'aria-live'?: 'off' | 'polite' | 'assertive';
  'aria-atomic'?: boolean;
  'aria-busy'?: boolean;
  'aria-invalid'?: boolean | 'grammar' | 'spelling';
  'aria-errormessage'?: string;
  'aria-valuemin'?: number;
  'aria-valuemax'?: number;
  'aria-valuenow'?: number;
  'aria-valuetext'?: string;
  tabIndex?: number;
}

export function createAriaButton(label: string, expanded?: boolean): AriaProps {
  return {
    role: 'button',
    'aria-label': label,
    'aria-expanded': expanded,
    tabIndex: 0,
  };
}

export function createAriaMenu(labelledBy: string): AriaProps {
  return {
    role: 'menu',
    'aria-labelledby': labelledBy,
    tabIndex: -1,
  };
}

export function createAriaMenuItem(label: string): AriaProps {
  return {
    role: 'menuitem',
    'aria-label': label,
    tabIndex: -1,
  };
}

export function createAriaDialog(labelledBy: string, describedBy?: string): AriaProps {
  return {
    role: 'dialog',
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
    'aria-modal': true,
  } as AriaProps & { 'aria-modal': boolean };
}

export function createAriaTab(selected: boolean, controlsId: string): AriaProps {
  return {
    role: 'tab',
    'aria-selected': selected,
    'aria-controls': controlsId,
    tabIndex: selected ? 0 : -1,
  };
}

export function createAriaTabPanel(labelledBy: string, hidden: boolean): AriaProps {
  return {
    role: 'tabpanel',
    'aria-labelledby': labelledBy,
    'aria-hidden': hidden,
    tabIndex: 0,
  };
}

export function createAriaProgressBar(
  value: number,
  min: number = 0,
  max: number = 100,
  label?: string
): AriaProps {
  return {
    role: 'progressbar',
    'aria-valuenow': value,
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuetext': `${Math.round((value / max) * 100)}%`,
    'aria-label': label,
  };
}

export function createAriaAlert(message: string): AriaProps {
  return {
    role: 'alert',
    'aria-live': 'assertive',
    'aria-atomic': true,
  };
}

export function createAriaStatus(message: string): AriaProps {
  return {
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': true,
  };
}

export function createAriaCombobox(
  expanded: boolean,
  controlsId: string,
  activeDescendant?: string
): AriaProps & { 'aria-activedescendant'?: string } {
  return {
    role: 'combobox',
    'aria-expanded': expanded,
    'aria-controls': controlsId,
    'aria-activedescendant': activeDescendant,
    'aria-haspopup': 'listbox',
  };
}

export function createAriaSlider(
  value: number,
  min: number,
  max: number,
  label: string
): AriaProps {
  return {
    role: 'slider',
    'aria-valuenow': value,
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-label': label,
    tabIndex: 0,
  };
}

export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, isActive: boolean = true) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const cleanup = trapFocus(container);
    return cleanup;
  }, [containerRef, isActive]);
}

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  handler: (event: KeyboardEvent) => void;
  description?: string;
  category?: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        if (!shortcut.key || !event.key) continue;
        const matchesKey = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const matchesCtrl = shortcut.ctrl
          ? event.ctrlKey
          : !event.ctrlKey || event.key === 'Control';
        const matchesShift = shortcut.shift
          ? event.shiftKey
          : !event.shiftKey || event.key === 'Shift';
        const matchesAlt = shortcut.alt ? event.altKey : !event.altKey || event.key === 'Alt';
        const matchesMeta = shortcut.meta ? event.metaKey : !event.metaKey || event.key === 'Meta';

        if (matchesKey && matchesCtrl && matchesShift && matchesAlt && matchesMeta) {
          event.preventDefault();
          shortcut.handler(event);
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, enabled]);
}

export function useFocusReturn() {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const saveFocus = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
  }, []);

  const restoreFocus = useCallback(() => {
    if (previousFocusRef.current && previousFocusRef.current.focus) {
      previousFocusRef.current.focus();
    }
  }, []);

  return { saveFocus, restoreFocus };
}

export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

export function useDialogAccessibility(
  dialogRef: React.RefObject<HTMLElement>,
  isOpen: boolean,
  onClose: () => void
) {
  const { saveFocus, restoreFocus } = useFocusReturn();

  useEffect(() => {
    if (isOpen) {
      saveFocus();
      announce('Dialog opened');
    } else {
      restoreFocus();
      announce('Dialog closed');
    }
  }, [isOpen, saveFocus, restoreFocus]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useFocusTrap(dialogRef, isOpen);
}

export function useLoadingAnnouncement(isLoading: boolean, message: string = 'Loading') {
  useEffect(() => {
    if (isLoading) {
      announce(`${message}, please wait`, 'polite');
    }
  }, [isLoading, message]);
}

export function useRovingTabIndex(
  itemsRef: React.RefObject<HTMLElement[]>,
  orientation: 'horizontal' | 'vertical' | 'both' = 'vertical'
) {
  const [focusedIndex, setFocusedIndex] = useState(0);

  useEffect(() => {
    const items = itemsRef.current;
    if (!items) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const currentIndex = items.findIndex((item) => item === document.activeElement);
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;

      switch (event.key) {
        case 'ArrowUp':
          if (orientation === 'vertical' || orientation === 'both') {
            event.preventDefault();
            nextIndex = Math.max(0, currentIndex - 1);
          }
          break;
        case 'ArrowDown':
          if (orientation === 'vertical' || orientation === 'both') {
            event.preventDefault();
            nextIndex = Math.min(items.length - 1, currentIndex + 1);
          }
          break;
        case 'ArrowLeft':
          if (orientation === 'horizontal' || orientation === 'both') {
            event.preventDefault();
            nextIndex = Math.max(0, currentIndex - 1);
          }
          break;
        case 'ArrowRight':
          if (orientation === 'horizontal' || orientation === 'both') {
            event.preventDefault();
            nextIndex = Math.min(items.length - 1, currentIndex + 1);
          }
          break;
        case 'Home':
          event.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          event.preventDefault();
          nextIndex = items.length - 1;
          break;
      }

      if (nextIndex !== currentIndex) {
        setFocusedIndex(nextIndex);
        items[nextIndex]?.focus();
      }
    };

    items.forEach((item) => {
      item.addEventListener('keydown', handleKeyDown);
    });

    return () => {
      items.forEach((item) => {
        item.removeEventListener('keydown', handleKeyDown);
      });
    };
  }, [itemsRef, orientation]);

  return focusedIndex;
}

export function useAriaLive() {
  const regionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    regionRef.current = createLiveRegion('polite');
    return () => {
      if (regionRef.current) {
        removeLiveRegion(regionRef.current);
      }
    };
  }, []);

  const announceMessage = useCallback((message: string) => {
    if (regionRef.current) {
      regionRef.current.textContent = message;
    }
  }, []);

  return announceMessage;
}

export function useScreenReaderOnly() {
  return {
    className: 'sr-only',
    'aria-hidden': false,
  };
}

export function useSkipLink(targetId: string) {
  const skipToContent = useCallback(() => {
    const target = document.getElementById(targetId);
    if (target) {
      target.tabIndex = -1;
      target.focus();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }, [targetId]);

  return skipToContent;
}

export function useHighContrastMode(): boolean {
  const [isHighContrast, setIsHighContrast] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: high)');
    setIsHighContrast(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setIsHighContrast(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isHighContrast;
}

export function useColorScheme(): 'light' | 'dark' | 'no-preference' {
  const [colorScheme, setColorScheme] = useState<'light' | 'dark' | 'no-preference'>('no-preference');

  useEffect(() => {
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const lightQuery = window.matchMedia('(prefers-color-scheme: light)');

    if (darkQuery.matches) {
      setColorScheme('dark');
    } else if (lightQuery.matches) {
      setColorScheme('light');
    }

    const handleDarkChange = (e: MediaQueryListEvent) => {
      if (e.matches) setColorScheme('dark');
    };

    const handleLightChange = (e: MediaQueryListEvent) => {
      if (e.matches) setColorScheme('light');
    };

    darkQuery.addEventListener('change', handleDarkChange);
    lightQuery.addEventListener('change', handleLightChange);

    return () => {
      darkQuery.removeEventListener('change', handleDarkChange);
      lightQuery.removeEventListener('change', handleLightChange);
    };
  }, []);

  return colorScheme;
}

export function useFocusVisible(): boolean {
  const [focusVisible, setFocusVisible] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        setFocusVisible(true);
      }
    };

    const handleMouseDown = () => {
      setFocusVisible(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  return focusVisible;
}

export function useId(prefix: string = 'id'): string {
  const idRef = useRef<string | null>(null);
  
  if (!idRef.current) {
    idRef.current = generateAriaId(prefix);
  }
  
  return idRef.current;
}

export function createAccessibleIcon(iconName: string, isDecorative: boolean = false): Record<string, unknown> {
  if (isDecorative) {
    return {
      'aria-hidden': true,
      role: 'presentation',
    };
  }
  return {
    'aria-label': iconName,
    role: 'img',
  };
}

export function getAccessibleImageProps(alt: string, isDecorative: boolean = false) {
  if (isDecorative) {
    return {
      alt: '',
      'aria-hidden': true,
      role: 'presentation',
    };
  }
  return {
    alt,
    role: 'img',
  };
}

export function useManageFocus(containerRef: React.RefObject<HTMLElement>) {
  const focusFirst = useCallback(() => {
    if (!containerRef.current) return;
    const focusable = getFocusableElements(containerRef.current);
    focusable[0]?.focus();
  }, [containerRef]);

  const focusLast = useCallback(() => {
    if (!containerRef.current) return;
    const focusable = getFocusableElements(containerRef.current);
    focusable[focusable.length - 1]?.focus();
  }, [containerRef]);

  const focusByIndex = useCallback((index: number) => {
    if (!containerRef.current) return;
    const focusable = getFocusableElements(containerRef.current);
    if (index >= 0 && index < focusable.length) {
      focusable[index]?.focus();
    }
  }, [containerRef]);

  return { focusFirst, focusLast, focusByIndex };
}
