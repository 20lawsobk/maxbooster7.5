import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';

interface ThemeToggleProps {
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
}

export function ThemeToggle({ 
  variant = 'outline', 
  size = 'icon',
  showLabel = false 
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <Button
      variant={variant}
      size={size}
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      className="transition-colors border-muted-foreground/30 hover:border-primary dark:border-muted-foreground/50 dark:hover:border-primary dark:text-foreground"
    >
      {theme === 'light' ? (
        <>
          <Moon className="h-5 w-5 text-foreground" />
          {showLabel && <span className="ml-2">Dark Mode</span>}
        </>
      ) : (
        <>
          <Sun className="h-5 w-5 text-amber-400" />
          {showLabel && <span className="ml-2">Light Mode</span>}
        </>
      )}
    </Button>
  );
}
