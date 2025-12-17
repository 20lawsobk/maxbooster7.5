import { Music } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'small';
}

export function Logo({ size = 'md' }: LogoProps) {
  const sizeMap = {
    sm: 'h-6 w-6',
    small: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  const textSizeMap = {
    sm: 'text-lg',
    small: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  return (
    <div className="flex items-center space-x-2">
      <div className={`${sizeMap[size]} flex items-center justify-center bg-gradient-to-br from-blue-600 to-cyan-500 rounded-lg`}>
        <Music className="h-2/3 w-2/3 text-white" />
      </div>
      <div className="flex flex-col">
        <span className={`font-bold ${textSizeMap[size]} bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent`}>Max Booster</span>
        <span className="text-xs text-gray-500">by B-Lawz Music</span>
      </div>
    </div>
  );
}
