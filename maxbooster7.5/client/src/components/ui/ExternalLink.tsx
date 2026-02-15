import { openExternalLink, isPWAStandalone } from '@/lib/externalLinks';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';

interface ExternalLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  showIcon?: boolean;
}

export function ExternalLink({ href, children, className, showIcon = true }: ExternalLinkProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openExternalLink(href);
  };
  
  return (
    <a
      href={href}
      onClick={handleClick}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      {showIcon && <ExternalLinkIcon className="inline-block ml-1 h-3 w-3" />}
    </a>
  );
}
