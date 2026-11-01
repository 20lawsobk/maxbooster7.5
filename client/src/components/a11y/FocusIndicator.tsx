import React, { useEffect, useState, useRef } from "react";

export interface FocusIndicatorProps {
  color?: string;
  width?: number;
  offset?: number;
  borderRadius?: number;
  transitionDuration?: number;
  className?: string;
  enabled?: boolean;
}

export function FocusIndicator({
  color = "hsl(var(--primary))",
  width = 2,
  offset = 2,
  borderRadius = 4,
  transitionDuration = 150,
  className = "",
  enabled = true,
}: FocusIndicatorProps) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const isKeyboardRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        isKeyboardRef.current = true;
      }
    };

    const handleMouseDown = () => {
      isKeyboardRef.current = false;
      setIsVisible(false);
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (!isKeyboardRef.current) return;

      const target = e.target as HTMLElement;
      if (!target || target === document.body) return;

      const rect = target.getBoundingClientRect();

      setPosition({
        top: rect.top + window.scrollY - offset,
        left: rect.left + window.scrollX - offset,
        width: rect.width + offset * 2,
        height: rect.height + offset * 2,
      });
      setIsVisible(true);
    };

    const handleFocusOut = () => {
      setIsVisible(false);
    };

    const handleScroll = () => {
      if (isVisible && document.activeElement) {
        const rect = (
          document.activeElement as HTMLElement
        ).getBoundingClientRect();
        setPosition({
          top: rect.top + window.scrollY - offset,
          left: rect.left + window.scrollX - offset,
          width: rect.width + offset * 2,
          height: rect.height + offset * 2,
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [enabled, offset, isVisible]);

  if (!enabled || !position || !isVisible) return null;

  return (
    <div
      ref={indicatorRef}
      className={`pointer-events-none fixed z-[9998] ${className}`}
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        height: position.height,
        border: `${width}px solid ${color}`,
        borderRadius: `${borderRadius}px`,
        transition: `all ${transitionDuration}ms ease-out`,
        boxShadow: `0 0 0 1px ${color}40`,
      }}
      aria-hidden="true"
    />
  );
}

export interface FocusRingProps {
  children: React.ReactNode;
  className?: string;
  focusClassName?: string;
  asChild?: boolean;
}

export function FocusRing({
  children,
  className = "",
  focusClassName = "ring-2 ring-primary ring-offset-2",
}: FocusRingProps) {
  const [isFocusVisible, setIsFocusVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let isKeyboard = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        isKeyboard = true;
      }
    };

    const handleMouseDown = () => {
      isKeyboard = false;
    };

    const handleFocus = () => {
      if (isKeyboard) {
        setIsFocusVisible(true);
      }
    };

    const handleBlur = () => {
      setIsFocusVisible(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    element.addEventListener("focus", handleFocus, true);
    element.addEventListener("blur", handleBlur, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
      element.removeEventListener("focus", handleFocus, true);
      element.removeEventListener("blur", handleBlur, true);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`${className} ${isFocusVisible ? focusClassName : ""}`}
    >
      {children}
    </div>
  );
}

export default FocusIndicator;
