import { Link, useLocation } from 'wouter';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from '@/components/ui/breadcrumb';
import { Home } from 'lucide-react';

// Mapping of route segments to human-readable labels
const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  analytics: 'Analytics',
  'social-media': 'Social Media',
  advertising: 'Advertising',
  marketplace: 'Marketplace',
  royalties: 'Royalties',
  studio: 'Studio',
  distribution: 'Distribution',
  pricing: 'Pricing',
  subscribe: 'Subscribe',
  admin: 'Admin',
  settings: 'Settings',
  features: 'Features',
  'api-docs': 'API',
  documentation: 'Documentation',
  about: 'About',
  blog: 'Blog',
  security: 'Security',
  dmca: 'DMCA',
  terms: 'Terms',
  privacy: 'Privacy',
  help: 'Help',
  login: 'Login',
  register: 'Register',
  payment: 'Payment',
  success: 'Success',
  edit: 'Edit',
  create: 'Create',
  new: 'New',
  view: 'View',
  'forgot-password': 'Forgot Password',
  'solo-founder-story': 'Solo Founder Story',
};

interface BreadcrumbItem {
  label: string;
  href: string;
  isLast: boolean;
}

/**
 * TODO: Add function documentation
 */
function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  // Handle root path
  if (pathname === '/') {
    return [];
  }

  const segments = pathname.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [];

  // Navigation links removed for security - no home links in protected routes

  // Build breadcrumbs from path segments (without home link)
  segments.forEach((segment, index) => {
    const path = '/' + segments.slice(0, index + 1).join('/');
    const isLast = index === segments.length - 1;

    // Check if segment is a UUID or numeric ID
    const isId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
      /^\d+$/.test(segment);

    let label: string;
    if (isId) {
      // For IDs, try to get a friendly name from context or use a generic label
      const previousSegment = segments[index - 1];
      if (previousSegment === 'projects') {
        label = 'Project Details';
      } else if (previousSegment === 'subscribe') {
        label = segment.toUpperCase() + ' Plan';
      } else {
        label = 'Details';
      }
    } else {
      // Use mapping or capitalize the segment
      label =
        ROUTE_LABELS[segment] ||
        segment
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
    }

    breadcrumbs.push({
      label,
      href: path,
      isLast,
    });
  });

  return breadcrumbs;
}

/**
 * TODO: Add function documentation
 */
export function BreadcrumbTrail() {
  const [location] = useLocation();
  const breadcrumbs = generateBreadcrumbs(location);

  // Don't show breadcrumbs on landing page, login, or register pages
  if (
    location === '/' ||
    location === '/login' ||
    location.startsWith('/register') ||
    location === '/terms' ||
    location === '/privacy'
  ) {
    return null;
  }

  // For mobile: show first, ellipsis, penultimate, and last if more than 3 items
  const shouldCollapse = breadcrumbs.length > 3;
  const mobileItems = shouldCollapse
    ? [breadcrumbs[0], breadcrumbs[breadcrumbs.length - 2], breadcrumbs[breadcrumbs.length - 1]]
    : breadcrumbs;

  return (
    <Breadcrumb data-testid="breadcrumb-navigation" className="mb-4">
      <BreadcrumbList>
        {/* Desktop view - show all breadcrumbs */}
        <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
          {breadcrumbs.map((item, index) => (
            <div key={item.href} className="inline-flex items-center gap-1.5">
              <BreadcrumbItem>
                {item.isLast ? (
                  <BreadcrumbPage
                    data-testid={`breadcrumb-current-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      href={item.href}
                      data-testid={`breadcrumb-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!item.isLast && <BreadcrumbSeparator />}
            </div>
          ))}
        </div>

        {/* Mobile view - show first, ellipsis (if needed), penultimate, and last */}
        <div className="flex sm:hidden flex-wrap items-center gap-1.5">
          {shouldCollapse ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link
                    href={mobileItems[0].href}
                    data-testid={`breadcrumb-link-mobile-${mobileItems[0].label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {mobileItems[0].label}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbEllipsis data-testid="breadcrumb-ellipsis" />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link
                    href={mobileItems[1].href}
                    data-testid={`breadcrumb-link-mobile-penultimate-${mobileItems[1].label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {mobileItems[1].label}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage
                  data-testid={`breadcrumb-current-mobile-${mobileItems[2].label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {mobileItems[2].label}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <>
              {mobileItems.map((item, index) => (
                <div key={item.href} className="inline-flex items-center gap-1.5">
                  <BreadcrumbItem>
                    {item.isLast ? (
                      <BreadcrumbPage
                        data-testid={`breadcrumb-current-mobile-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {item.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link
                          href={item.href}
                          data-testid={`breadcrumb-link-mobile-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          {item.label}
                        </Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!item.isLast && <BreadcrumbSeparator />}
                </div>
              ))}
            </>
          )}
        </div>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
