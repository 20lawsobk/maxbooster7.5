import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface SkipLink {
  id: string;
  label: string;
}

const defaultLinks: SkipLink[] = [
  { id: 'main-content', label: 'Skip to main content' },
  { id: 'navigation', label: 'Skip to navigation' },
  { id: 'search', label: 'Skip to search' },
];

interface SkipLinksProps {
  links?: SkipLink[];
}

/**
 * TODO: Add function documentation
 */
export function SkipLinks({ links = defaultLinks }: SkipLinksProps) {
  const [focused, setFocused] = useState(false);

  const handleSkip = (targetId: string) => {
    const element = document.getElementById(targetId);
    if (element) {
      element.tabIndex = -1;
      element.focus();
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div
      className={`
        fixed top-0 left-0 z-[9999] bg-background p-4 transform transition-transform
        ${focused ? 'translate-y-0' : '-translate-y-full'}
      `}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <nav aria-label="Skip links" className="flex gap-2">
        {links.map((link) => (
          <Button
            key={link.id}
            variant="secondary"
            size="sm"
            onClick={() => handleSkip(link.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSkip(link.id);
              }
            }}
            className="focus-visible:outline-offset-2"
          >
            {link.label}
          </Button>
        ))}
      </nav>
    </div>
  );
}
