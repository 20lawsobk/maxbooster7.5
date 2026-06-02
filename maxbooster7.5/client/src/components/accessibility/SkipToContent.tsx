import React, { useCallback, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { announcePolite } from "@/lib/a11y/screenReader";

export interface SkipLinkItem {
  id: string;
  label: string;
  shortcut?: string;
  priority?: number;
}

export interface SkipToContentProps {
  mainContentId?: string;
  mainContentLabel?: string;
  additionalLinks?: SkipLinkItem[];
  respectReducedMotion?: boolean;
  className?: string;
}

const defaultLinks: SkipLinkItem[] = [
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
];

export function SkipToContent({
  mainContentId = "main-content",
  mainContentLabel = "Skip to main content",
  additionalLinks = [],
  respectReducedMotion = true,
  className,
}: SkipToContentProps) {
  const [focused, setFocused] = useState(false);
  const [availableLinks, setAvailableLinks] = useState<SkipLinkItem[]>([]);

  const allLinks: SkipLinkItem[] = [
    {
      id: mainContentId,
      label: mainContentLabel,
      shortcut: "Alt+1",
      priority: 0,
    },
    ...additionalLinks,
  ];

  useEffect(() => {
    const checkAvailableTargets = () => {
      const available = allLinks.filter((link) => {
        const element = document.getElementById(link.id);
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      });

      setAvailableLinks(
        available.sort((a, b) => (a.priority || 99) - (b.priority || 99)),
      );
    };

    checkAvailableTargets();

    const observer = new MutationObserver(checkAvailableTargets);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [allLinks.length]);

  const skipToTarget = useCallback(
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

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey) return;

      const numKey = parseInt(event.key, 10);
      if (numKey >= 1 && numKey <= availableLinks.length && numKey <= 9) {
        const link = availableLinks[numKey - 1];
        if (link) {
          event.preventDefault();
          skipToTarget(link.id, link.label);
        }
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [availableLinks, skipToTarget]);

  if (availableLinks.length === 0) return null;

  return (
    <div
      className={`
        fixed top-0 left-0 z-[9999] bg-background border-b shadow-lg p-4 
        transform transition-transform duration-200 ease-in-out
        ${focused ? "translate-y-0" : "-translate-y-full"}
        focus-within:translate-y-0
        ${className || ""}
      `}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setFocused(false);
        }
      }}
    >
      <nav
        aria-label="Skip navigation links"
        role="navigation"
        className="flex flex-wrap gap-2"
      >
        {availableLinks.map((link) => (
          <Button
            key={link.id}
            variant="secondary"
            size="sm"
            onClick={() => skipToTarget(link.id, link.label)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                skipToTarget(link.id, link.label);
              }
            }}
            className="focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-keyshortcuts={link.shortcut}
          >
            {link.label}
            {link.shortcut && (
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

export interface SkipLinkProps {
  targetId: string;
  label?: string;
  className?: string;
}

export function SkipLink({
  targetId,
  label = "Skip to content",
  className,
}: SkipLinkProps) {
  const handleClick = useCallback(() => {
    const element = document.getElementById(targetId);
    if (element) {
      element.setAttribute("tabindex", "-1");
      element.focus();
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      announcePolite(`Navigated to ${label.replace("Skip to ", "")}`);
    }
  }, [targetId, label]);

  return (
    <a
      href={`#${targetId}`}
      onClick={(e) => {
        e.preventDefault();
        handleClick();
      }}
      className={`
        sr-only focus:not-sr-only
        focus:absolute focus:top-4 focus:left-4 focus:z-[9999]
        focus:bg-background focus:text-foreground
        focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg
        focus:ring-2 focus:ring-primary focus:ring-offset-2
        ${className || ""}
      `}
    >
      {label}
    </a>
  );
}

export default SkipToContent;
