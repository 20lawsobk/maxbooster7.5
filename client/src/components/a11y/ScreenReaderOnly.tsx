import React from "react";

export interface ScreenReaderOnlyProps {
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
  focusable?: boolean;
  id?: string;
  className?: string;
}

const srOnlyStyles: React.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const focusableStyles: React.CSSProperties = {
  position: "static",
  width: "auto",
  height: "auto",
  padding: "inherit",
  margin: "inherit",
  overflow: "visible",
  clip: "auto",
  whiteSpace: "normal",
};

export function ScreenReaderOnly({
  children,
  as: Component = "span",
  focusable = false,
  id,
  className = "",
}: ScreenReaderOnlyProps) {
  const [isFocused, setIsFocused] = React.useState(false);

  const handleFocus = React.useCallback(() => {
    if (focusable) {
      setIsFocused(true);
    }
  }, [focusable]);

  const handleBlur = React.useCallback(() => {
    if (focusable) {
      setIsFocused(false);
    }
  }, [focusable]);

  const styles = isFocused && focusable ? focusableStyles : srOnlyStyles;

  return React.createElement(
    Component,
    {
      style: styles,
      id,
      className: `sr-only ${className}`.trim(),
      tabIndex: focusable ? 0 : undefined,
      onFocus: focusable ? handleFocus : undefined,
      onBlur: focusable ? handleBlur : undefined,
      "aria-hidden": false,
    },
    children,
  );
}

export interface VisuallyHiddenProps extends ScreenReaderOnlyProps {}

export function VisuallyHidden(props: VisuallyHiddenProps) {
  return <ScreenReaderOnly {...props} />;
}

export interface AccessibleTextProps {
  children: React.ReactNode;
  visualText?: React.ReactNode;
  id?: string;
}

export function AccessibleText({
  children,
  visualText,
  id,
}: AccessibleTextProps) {
  if (visualText !== undefined) {
    return (
      <>
        <span aria-hidden="true">{visualText}</span>
        <ScreenReaderOnly id={id}>{children}</ScreenReaderOnly>
      </>
    );
  }

  return <ScreenReaderOnly id={id}>{children}</ScreenReaderOnly>;
}

export interface AccessibleIconProps {
  icon: React.ReactNode;
  label: string;
  id?: string;
}

export function AccessibleIcon({ icon, label, id }: AccessibleIconProps) {
  return (
    <>
      <span aria-hidden="true">{icon}</span>
      <ScreenReaderOnly id={id}>{label}</ScreenReaderOnly>
    </>
  );
}

export interface AccessibleDescriptionProps {
  id: string;
  children: React.ReactNode;
}

export function AccessibleDescription({
  id,
  children,
}: AccessibleDescriptionProps) {
  return <ScreenReaderOnly id={id}>{children}</ScreenReaderOnly>;
}

export default ScreenReaderOnly;
