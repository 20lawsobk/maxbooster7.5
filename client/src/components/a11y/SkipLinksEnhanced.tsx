import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { announcePolite } from '@/lib/a11y/screenReader';

export interface SkipLink {
  id: string;
  label: string;
  shortcut?: string;
}

const defaultLinks: SkipLink[] = [
  { id: 'main-content', label: 'Skip to main content', shortcut: 'Alt+1' },
  { id: 'navigation', label: 'Skip to navigation', shortcut: 'Alt+2' },
  { id: 'search', label: 'Skip to search', shortcut: 'Alt+3' },
  { id: 'footer', label: 'Skip to footer', shortcut: 'Alt+4' },
];

export interface SkipLinksEnhancedProps {
  links?: SkipLink[];
  className?: string;
  showShortcuts?: boolean;
}

export function SkipLinksEnhanced({
  links = defaultLinks,
  className = '',
  showShortcuts = true,
}: SkipLinksEnhancedProps) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isVisible, setIsVisible] = useState(false);

  const handleSkip = useCallback((targetId: string, label: string) => {
    const element = document.getElementById(targetId);
    if (element) {
      element.setAttribute('tabindex', '-1');
      element.focus();
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      announcePolite(`Skipped to ${label.replace('Skip to ', '')}`);
      
      const handleBlur = () => {
        if (!element.hasAttribute('data-original-tabindex')) {
          element.removeAttribute('tabindex');
        }
        element.removeEventListener('blur', handleBlur);
      };
      element.addEventListener('blur', handleBlur);
    } else {
      announcePolite(`${label.replace('Skip to ', '')} section not found`);
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % links.length);
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + links.length) % links.length);
          break;
        case 'Home':
          event.preventDefault();
          setFocusedIndex(0);
          break;
        case 'End':
          event.preventDefault();
          setFocusedIndex(links.length - 1);
          break;
      }
    },
    [links.length]
  );

  React.useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey) return;

      const numKey = parseInt(event.key, 10);
      if (numKey >= 1 && numKey <= links.length) {
        event.preventDefault();
        const link = links[numKey - 1];
        handleSkip(link.id, link.label);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [links, handleSkip]);

  React.useEffect(() => {
    if (focusedIndex >= 0) {
      const buttons = document.querySelectorAll<HTMLButtonElement>(
        '[data-skip-link]'
      );
      buttons[focusedIndex]?.focus();
    }
  }, [focusedIndex]);

  return (
    <div
      className={`
        fixed top-0 left-0 z-[9999] bg-background border-b shadow-lg
        transform transition-transform duration-200 ease-in-out
        ${isVisible ? 'translate-y-0' : '-translate-y-full'}
        focus-within:translate-y-0
        ${className}
      `}
      onFocus={() => setIsVisible(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsVisible(false);
          setFocusedIndex(-1);
        }
      }}
      onKeyDown={handleKeyDown}
      role="navigation"
      aria-label="Skip links"
    >
      <div className="container max-w-screen-xl mx-auto p-2">
        <ul className="flex flex-wrap gap-2" role="list">
          {links.map((link, index) => (
            <li key={link.id}>
              <Button
                variant="secondary"
                size="sm"
                data-skip-link
                onClick={() => handleSkip(link.id, link.label)}
                onFocus={() => setFocusedIndex(index)}
                className="focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-keyshortcuts={link.shortcut}
              >
                {link.label}
                {showShortcuts && link.shortcut && (
                  <span className="ml-2 text-xs opacity-70 hidden sm:inline">
                    ({link.shortcut})
                  </span>
                )}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default SkipLinksEnhanced;
