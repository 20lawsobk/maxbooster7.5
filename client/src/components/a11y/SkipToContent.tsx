import React, { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { announcePolite } from "@/lib/a11y/screenReader";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export interface SkipToContentProps {
  mainContentId?: string;
  label?: string;
  className?: string;
}

export function SkipToContent({
  mainContentId = "main-content",
  label = "Skip to main content",
  className = "",
}: SkipToContentProps) {
  const { prefersReducedMotion } = useReducedMotion();

  const handleClick = useCallback(() => {
    const mainContent = document.getElementById(mainContentId);
    if (mainContent) {
      mainContent.setAttribute("tabindex", "-1");
      mainContent.focus();
      mainContent.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
      announcePolite("Skipped to main content");

      const handleBlur = () => {
        if (!mainContent.hasAttribute("data-original-tabindex")) {
          mainContent.removeAttribute("tabindex");
        }
        mainContent.removeEventListener("blur", handleBlur);
      };
      mainContent.addEventListener("blur", handleBlur);
    } else {
      announcePolite("Main content not found");
    }
  }, [mainContentId, prefersReducedMotion]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  return (
    <Button
      variant="default"
      size="sm"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`
        fixed top-0 left-0 z-[9999] m-2
        transform -translate-y-full
        focus:translate-y-0
        transition-transform duration-200
        focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
        ${className}
      `}
      aria-keyshortcuts="Alt+1"
    >
      {label}
    </Button>
  );
}

export interface SkipLinkProps {
  targetId: string;
  label: string;
  shortcut?: string;
  className?: string;
}

export function SkipLink({
  targetId,
  label,
  shortcut,
  className = "",
}: SkipLinkProps) {
  const { prefersReducedMotion } = useReducedMotion();

  const handleClick = useCallback(() => {
    const target = document.getElementById(targetId);
    if (target) {
      target.setAttribute("tabindex", "-1");
      target.focus();
      target.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
      announcePolite(`Navigated to ${label.replace("Skip to ", "")}`);
    }
  }, [targetId, label, prefersReducedMotion]);

  return (
    <a
      href={`#${targetId}`}
      onClick={(e) => {
        e.preventDefault();
        handleClick();
      }}
      className={`
        sr-only focus:not-sr-only
        focus:absolute focus:z-[9999] focus:top-2 focus:left-2
        focus:bg-primary focus:text-primary-foreground
        focus:px-4 focus:py-2 focus:rounded-md
        focus:shadow-lg focus:outline-none
        focus-visible:ring-2 focus-visible:ring-offset-2
        ${className}
      `}
      aria-keyshortcuts={shortcut}
    >
      {label}
      {shortcut && (
        <span className="ml-2 text-xs opacity-70">({shortcut})</span>
      )}
    </a>
  );
}

export default SkipToContent;
