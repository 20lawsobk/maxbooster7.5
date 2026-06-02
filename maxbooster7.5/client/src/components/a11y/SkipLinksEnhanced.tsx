import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { announcePolite } from "@/lib/a11y/screenReader";

export interface SkipLink {
  id: string;
  label: string;
  shortcut?: string;
  priority?: number;
  icon?: React.ReactNode;
}

const defaultLinks: SkipLink[] = [
  {
    id: "main-content",
    label: "Skip to main content",
    shortcut: "Alt+1",
    priority: 1,
  },
  {
    id: "navigation",
    label: "Skip to navigation",
    shortcut: "Alt+2",
    priority: 2,
  },
  { id: "search", label: "Skip to search", shortcut: "Alt+3", priority: 3 },
  { id: "sidebar", label: "Skip to sidebar", shortcut: "Alt+4", priority: 4 },
  { id: "footer", label: "Skip to footer", shortcut: "Alt+5", priority: 5 },
  { id: "breadcrumb", label: "Skip to breadcrumb", priority: 6 },
  { id: "actions", label: "Skip to actions", priority: 7 },
  { id: "filters", label: "Skip to filters", priority: 8 },
];

export interface SkipLinksEnhancedProps {
  links?: SkipLink[];
  className?: string;
  showShortcuts?: boolean;
  respectReducedMotion?: boolean;
  autoDetectTargets?: boolean;
}

export function SkipLinksEnhanced({
  links = defaultLinks,
  className = "",
  showShortcuts = true,
  respectReducedMotion = true,
  autoDetectTargets = true,
}: SkipLinksEnhancedProps) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isVisible, setIsVisible] = useState(false);
  const [activeLinks, setActiveLinks] = useState<SkipLink[]>([]);

  useEffect(() => {
    if (!autoDetectTargets) {
      setActiveLinks(links);
      return;
    }

    const checkAvailableTargets = () => {
      const available = links.filter((link) => {
        const element = document.getElementById(link.id);
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      });

      setActiveLinks(
        available.sort((a, b) => (a.priority || 99) - (b.priority || 99)),
      );
    };

    checkAvailableTargets();

    const observer = new MutationObserver(checkAvailableTargets);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [links, autoDetectTargets]);

  const handleSkip = useCallback(
    (targetId: string, label: string) => {
      const element = document.getElementById(targetId);
      if (element) {
        element.setAttribute("tabindex", "-1");
        element.focus({ preventScroll: false });

        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        element.scrollIntoView({
          behavior:
            respectReducedMotion && prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });

        announcePolite(`Navigated to ${label.replace("Skip to ", "")}`);

        const handleBlur = () => {
          if (!element.hasAttribute("data-original-tabindex")) {
            element.removeAttribute("tabindex");
          }
          element.removeEventListener("blur", handleBlur);
        };
        element.addEventListener("blur", handleBlur);
      } else {
        announcePolite(`${label.replace("Skip to ", "")} section not found`);
      }
    },
    [respectReducedMotion],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case "ArrowDown":
        case "ArrowRight":
          event.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % links.length);
          break;
        case "ArrowUp":
        case "ArrowLeft":
          event.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + links.length) % links.length);
          break;
        case "Home":
          event.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          event.preventDefault();
          setFocusedIndex(links.length - 1);
          break;
      }
    },
    [links.length],
  );

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey) return;

      const numKey = parseInt(event.key, 10);
      if (numKey >= 1 && numKey <= activeLinks.length && numKey <= 9) {
        const link = activeLinks.find((l) => l.shortcut === `Alt+${numKey}`);
        if (link) {
          event.preventDefault();
          handleSkip(link.id, link.label);
        }
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [activeLinks, handleSkip]);

  useEffect(() => {
    if (focusedIndex >= 0) {
      const buttons =
        document.querySelectorAll<HTMLButtonElement>("[data-skip-link]");
      buttons[focusedIndex]?.focus();
    }
  }, [focusedIndex]);

  if (activeLinks.length === 0) return null;

  return (
    <div
      className={`
        fixed top-0 left-0 z-[9999] bg-background border-b shadow-lg p-4
        transform transition-transform duration-200 ease-in-out
        ${isVisible ? "translate-y-0" : "-translate-y-full"}
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
      aria-label="Skip navigation links"
    >
      <nav className="flex flex-wrap gap-2">
        {activeLinks.map((link, index) => (
          <Button
            key={link.id}
            variant="secondary"
            size="sm"
            data-skip-link
            onClick={() => handleSkip(link.id, link.label)}
            onFocus={() => setFocusedIndex(index)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSkip(link.id, link.label);
              }
            }}
            className="focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-keyshortcuts={link.shortcut}
          >
            {link.icon}
            {link.label}
            {showShortcuts && link.shortcut && (
              <span className="ml-2 text-xs opacity-70 hidden sm:inline">
                ({link.shortcut})
              </span>
            )}
          </Button>
        ))}
      </nav>
    </div>
  );
}

export default SkipLinksEnhanced;
