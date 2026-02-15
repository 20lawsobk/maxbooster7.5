interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'small';
  showText?: boolean;
}

export function Logo({ size = 'md', showText = true }: LogoProps) {
  const sizeMap = {
    sm: 'h-8 w-8',
    small: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-14 w-14',
  };

  const textSizeMap = {
    sm: 'text-lg',
    small: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  return (
    <div className="flex items-center gap-2">
      <img 
        src="/logo.png" 
        alt="B-Lawz Music" 
        className={`${sizeMap[size]} rounded-lg object-cover`}
      />
      {showText && (
        <div className="flex flex-col">
          <span className={`font-bold ${textSizeMap[size]} bg-gradient-to-r from-blue-500 to-cyan-400 bg-clip-text text-transparent`}>Max Booster</span>
          <span className="text-xs text-muted-foreground">by B-Lawz Music</span>
        </div>
      )}
    </div>
  );
}
