interface LogoProps {
  size?: "sm" | "md" | "lg" | "small";
  showText?: boolean;
  className?: string;
}

export function Logo({
  size = "md",
  showText = true,
  className = "",
}: LogoProps) {
  const sizeMap = {
    sm: "h-8 w-8",
    small: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-14 w-14",
  };

  const textSizeMap = {
    sm: "text-lg",
    small: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src="/logo.png"
        alt="B-Lawz Music"
        className={`${sizeMap[size]} rounded-lg object-cover flex-shrink-0`}
        loading="eager"
        decoding="async"
      />
      {showText && (
        <div className="flex flex-col">
          <span
            className={`font-bold ${textSizeMap[size]} bg-gradient-to-r from-blue-500 to-cyan-400 bg-clip-text text-transparent leading-tight`}
          >
            Max Booster
          </span>
          <span className="text-xs text-muted-foreground leading-tight">
            by B-Lawz Music
          </span>
        </div>
      )}
    </div>
  );
}
