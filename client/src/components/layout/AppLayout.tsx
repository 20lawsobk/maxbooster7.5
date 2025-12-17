import { useState, ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BreadcrumbTrail } from './Breadcrumb';

interface AppLayoutProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  noPadding?: boolean;
}

/**
 * TODO: Add function documentation
 */
export function AppLayout({ title, subtitle, children, noPadding = false }: AppLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-background">
      <Sidebar isMobileOpen={isMobileMenuOpen} onMobileClose={() => setIsMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar title={title} subtitle={subtitle} onMenuClick={() => setIsMobileMenuOpen(true)} />

        <main
          className={`flex-1 ${noPadding ? 'overflow-hidden' : 'overflow-y-auto p-4 sm:p-6 lg:p-8'}`}
        >
          <BreadcrumbTrail />
          {children}
        </main>
      </div>
    </div>
  );
}
