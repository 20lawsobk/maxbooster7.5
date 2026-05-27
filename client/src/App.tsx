import { lazy, Suspense, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Switch, Route, useLocation } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { InstantSkeleton } from '@/components/ui/instant-skeleton';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SkipLinks } from '@/components/SkipLinks';
import { useNPSSurvey } from '@/hooks/useNPSSurvey';
import TokenRefreshHandler from '@/components/auth/TokenRefreshHandler';
import { InactivityManager } from '@/components/auth/InactivityManager';
import { UndoProvider } from '@/contexts/UndoContext';
import { ShortcutProvider } from '@/contexts/ShortcutContext';
import { useAuth } from '@/hooks/useAuth';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { useKeyboardShortcuts, announce } from '@/lib/accessibility';
import { setupLinkPrefetching, prefetchAdjacentRoutes, setAuthState, bootstrapUserData, prefetchAllAuthChunks } from '@/lib/prefetch';

const Landing = lazy(() => import('@/pages/Landing'));

// ── Deferred global UI ──────────────────────────────────────────────────────
// These components are never visible on first paint (they open on keypress,
// show only for new visitors, or trigger via async events). Lazy-loading them
// removes their module code from the initial JS parse budget entirely.
const KeyboardShortcutsDialog = lazy(() => import('@/components/dialogs/KeyboardShortcutsDialog').then(m => ({ default: m.KeyboardShortcutsDialog })));
const CookieConsentBanner     = lazy(() => import('@/components/CookieConsentBanner').then(m => ({ default: m.CookieConsentBanner })));
const NPSSurvey               = lazy(() => import('@/components/retention/NPSSurvey').then(m => ({ default: m.NPSSurvey })));
const AIAssistantPublic       = lazy(() => import('@/components/support/AIAssistantPublic').then(m => ({ default: m.AIAssistantPublic })));
const AIAssistantPersonalized = lazy(() => import('@/components/support/AIAssistantPersonalized').then(m => ({ default: m.AIAssistantPersonalized })));
const InstallBanner           = lazy(() => import('@/components/pwa/InstallBanner').then(m => ({ default: m.InstallBanner })));
const DeepLinkHandler         = lazy(() => import('@/components/DeepLinkHandler').then(m => ({ default: m.DeepLinkHandler })));
const OAuthCallbackHandler    = lazy(() => import('@/components/OAuthCallbackHandler').then(m => ({ default: m.OAuthCallbackHandler })));
const UndoToast               = lazy(() => import('@/components/undo/UndoToast').then(m => ({ default: m.UndoToast })));
const CommandPalette          = lazy(() => import('@/components/commands/CommandPalette').then(m => ({ default: m.CommandPalette })));
const ShortcutGuide           = lazy(() => import('@/components/shortcuts').then(m => ({ default: m.ShortcutGuide })));
const QuickActionBar          = lazy(() => import('@/components/shortcuts').then(m => ({ default: m.QuickActionBar })));
const ConnectionStatusBar     = lazy(() => import('@/components/ConnectionStatusBar').then(m => ({ default: m.ConnectionStatusBar })));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const RegisterPayment = lazy(() => import('@/pages/RegisterPayment'));
const RegisterSuccess = lazy(() => import('@/pages/RegisterSuccess'));
const Terms = lazy(() => import('@/pages/Terms'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const Features = lazy(() => import('@/pages/Features'));
const API = lazy(() => import('@/pages/API'));
const Documentation = lazy(() => import('@/pages/Documentation'));
const About = lazy(() => import('@/pages/About'));
const Blog = lazy(() => import('@/pages/Blog'));
const BlogPost = lazy(() => import('@/pages/BlogPost'));
const SoloFounderStory = lazy(() => import('@/pages/SoloFounderStory'));
const SecurityPage = lazy(() => import('@/pages/SecurityPage'));
const DMCA = lazy(() => import('@/pages/DMCA'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const NotFound = lazy(() => import('@/pages/not-found'));

const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Studio = lazy(() => import('@/pages/Studio'));
const Marketplace = lazy(() => import('@/pages/Marketplace'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const AIDashboard = lazy(() => import('@/pages/analytics/AIDashboard'));
const SocialMedia = lazy(() => import('@/pages/SocialMedia'));
const Advertisement = lazy(() => import('@/pages/Advertisement'));
const Distribution = lazy(() => import('@/pages/Distribution'));
const Royalties = lazy(() => import('@/pages/Royalties'));
const Settings = lazy(() => import('@/pages/Settings'));
const Admin = lazy(() => import('@/pages/Admin'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const SecurityDashboard = lazy(() => import('@/pages/admin/SecurityDashboard'));
const SupportDashboard = lazy(() => import('@/pages/admin/SupportDashboard'));
const Projects = lazy(() => import('@/pages/Projects'));
const Pricing = lazy(() => import('@/pages/Pricing'));
const Subscribe = lazy(() => import('@/pages/Subscribe'));
const DeveloperApi = lazy(() => import('@/pages/DeveloperApi'));
const SimplifiedDashboard = lazy(() => import('@/pages/SimplifiedDashboard'));
const DesktopApp = lazy(() => import('@/pages/DesktopApp'));
const ShowPage = lazy(() => import('@/pages/ShowPage'));
const Help = lazy(() => import('@/pages/Help'));
const Storefront = lazy(() => import('@/pages/Storefront'));
const AdminAutonomy = lazy(() => import('@/pages/AdminAutonomy'));
const ProducerProfilePage = lazy(() => import('@/pages/ProducerProfilePage'));
const Verification = lazy(() => import('@/pages/Verification'));
const KYCReview = lazy(() => import('@/pages/admin/KYCReview'));
const TrainingDashboard = lazy(() => import('@/pages/admin/TrainingDashboard'));
const Contracts = lazy(() => import('@/pages/Contracts'));
const Workspaces = lazy(() => import('@/pages/Workspaces'));
const Collaborations = lazy(() => import('@/pages/Collaborations'));
const CareerCoach = lazy(() => import('@/pages/CareerCoach'));
const Assistant = lazy(() => import('@/pages/Assistant'));
const ReleaseCountdown = lazy(() => import('@/pages/ReleaseCountdown'));
const Invoices = lazy(() => import('@/pages/Invoices'));
const HandleLink = lazy(() => import('@/pages/HandleLink'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const MusicWorkflowAutomations = lazy(() => import('@/pages/MusicWorkflowAutomations'));
const Shows = lazy(() => import('@/pages/Shows'));
const FanHub = lazy(() => import('@/pages/FanHub'));
const MerchStore = lazy(() => import('@/pages/MerchStore'));
const PressKit = lazy(() => import('@/pages/PressKit'));
const PlaylistPitching = lazy(() => import('@/pages/PlaylistPitching'));
const Publishing = lazy(() => import('@/pages/Publishing'));
const SyncLicensing = lazy(() => import('@/pages/SyncLicensing'));
const PublicPressKit = lazy(() => import('@/pages/PublicPressKit'));

// Inline component: resolves /s/:label → /storefront/:slug
function StorefrontShortLink({ params }: { params?: { label?: string } }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const label = params?.label;
    if (!label) { setLocation('/marketplace'); return; }
    fetch(`/api/storefront-domains/resolve/${encodeURIComponent(label)}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.slug) setLocation(`/storefront/${d.slug}`);
        else setLocation('/marketplace');
      })
      .catch(() => setLocation('/marketplace'));
  }, [params?.label]);
  return null;
}


function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/register" component={Register} />
      <Route path="/register/payment/:tier" component={RegisterPayment} />
      <Route path="/register/success" component={RegisterSuccess} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/simplified-dashboard" component={SimplifiedDashboard} />
      <Route path="/projects" component={Projects} />
      <Route path="/desktop-app" component={DesktopApp} />
      <Route path="/analytics/ai" component={AIDashboard} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/developer-api" component={DeveloperApi} />
      <Route path="/social-media" component={SocialMedia} />
      <Route path="/advertising" component={Advertisement} />
      <Route path="/marketplace" component={Marketplace} />
      <Route path="/marketplace/producer/:producerId" component={ProducerProfilePage} />
      <Route path="/royalties" component={Royalties} />
      <Route path="/studio/:projectId" component={Studio} />
      <Route path="/studio" component={Studio} />
      <Route path="/show" component={ShowPage} />
      <Route path="/distribution" component={Distribution} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/subscribe/:tier" component={Subscribe} />
      <Route path="/admin/security" component={SecurityDashboard} />
      <Route path="/admin/support" component={SupportDashboard} />
      <Route path="/admin/kyc" component={KYCReview} />
      <Route path="/admin/training" component={TrainingDashboard} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin" component={Admin} />
      <Route path="/settings" component={Settings} />
      <Route path="/features" component={Features} />
      <Route path="/api-docs" component={API} />
      <Route path="/documentation" component={Documentation} />
      <Route path="/about" component={About} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/solo-founder-story" component={SoloFounderStory} />
      <Route path="/security" component={SecurityPage} />
      <Route path="/dmca" component={DMCA} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/help" component={Help} />
      <Route path="/storefront" component={Storefront} />
      <Route path="/storefront/:slug" component={Storefront} />
      <Route path="/store/:slug" component={Storefront} />
      <Route path="/s/:label" component={StorefrontShortLink} />
      <Route path="/admin/autonomy" component={AdminAutonomy} />
      <Route path="/verification" component={Verification} />
      <Route path="/contracts" component={Contracts} />
      <Route path="/workspaces" component={Workspaces} />
      <Route path="/collaborations" component={Collaborations} />
      <Route path="/career-coach" component={CareerCoach} />
      <Route path="/assistant" component={Assistant} />
      <Route path="/release-countdown" component={ReleaseCountdown} />
      <Route path="/invoices" component={Invoices} />
      <Route path="/handle-link" component={HandleLink} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/workflow-automations" component={MusicWorkflowAutomations} />
      <Route path="/shows" component={Shows} />
      <Route path="/fan-hub" component={FanHub} />
      <Route path="/merch" component={MerchStore} />
      <Route path="/press-kit" component={PressKit} />
      <Route path="/playlist-pitching" component={PlaylistPitching} />
      <Route path="/publishing" component={Publishing} />
      <Route path="/sync-licensing" component={SyncLicensing} />
      <Route path="/epk/:slug" component={PublicPressKit} />
      <Route component={NotFound} />
    </Switch>
  );
}

function isNativeApp(): boolean {
  return !!(window as Record<string, unknown>).electronAPI?.isElectron ||
    !!(window as Record<string, unknown>).Capacitor?.isNativePlatform?.();
}

const PUBLIC_ONLY_ROUTES = [
  '/',
  '/about',
  '/blog',
  '/features',
  '/pricing',
  '/security',
  '/dmca',
  '/terms',
  '/privacy',
  '/api-docs',
  '/documentation',
  '/solo-founder-story',
  '/desktop-app',
  '/help',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];
const PUBLIC_ONLY_PREFIXES = ['/blog/', '/blog', '/register/payment/', '/register/'];

// Scroll the page to the top whenever the user navigates to a new route.
function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location]);
  return null;
}

function AppWithKeyboardShortcuts() {
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    setAuthState(!!user);
    if (user) {
      bootstrapUserData(qc);
      prefetchAllAuthChunks();
    }
  }, [user, qc]);

  useEffect(() => {
    if (isLoading) return;
    if (user) return;
    const isPublic =
      PUBLIC_ONLY_ROUTES.includes(location) ||
      PUBLIC_ONLY_PREFIXES.some(p => location.startsWith(p)) ||
      location.startsWith('/storefront/') ||
      location.startsWith('/store/') ||
      location.startsWith('/handle-link') ||
      location === '/verification' ||
      location === '/pricing';
    if (!isPublic) {
      setLocation(`/login?redirect=${encodeURIComponent(location)}`);
    }
  }, [user, isLoading, location]);

  useEffect(() => {
    if (isNativeApp() && (PUBLIC_ONLY_ROUTES.includes(location) || PUBLIC_ONLY_PREFIXES.some((p) => location.startsWith(p)))) {
      setLocation('/dashboard');
    }
  }, [location]);

  useEffect(() => {
    const metaEl = document.querySelector('meta[name="x-maxbooster-subdomain"]');
    const storefrontSlug = metaEl?.getAttribute('content') || (window as Record<string, unknown>).__MAXBOOSTER_SUBDOMAIN__;
    if (storefrontSlug && typeof storefrontSlug === 'string') {
      setLocation(`/storefront/${storefrontSlug}`);
    }
  }, []);

  const shortcuts = [
    {
      key: '?',
      shift: true,
      handler: () => setShowShortcutsDialog(true),
      description: 'Open keyboard shortcuts help',
      category: 'Global',
    },
    {
      key: '/',
      handler: () => {
        const searchInput = document.querySelector(
          '[data-testid="search-input"]'
        ) as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          announce('Search focused');
        }
      },
      description: 'Focus search',
      category: 'Global',
    },
    {
      key: 'h',
      alt: true,
      handler: () => {
        setLocation('/dashboard');
        announce('Navigating to Dashboard');
      },
      description: 'Go to Dashboard',
      category: 'Navigation',
    },
    {
      key: 's',
      alt: true,
      handler: () => {
        setLocation('/studio');
        announce('Navigating to Studio');
      },
      description: 'Go to Studio',
      category: 'Navigation',
    },
    {
      key: 'p',
      alt: true,
      handler: () => {
        setLocation('/projects');
        announce('Navigating to Projects');
      },
      description: 'Go to Projects',
      category: 'Navigation',
    },
  ];

  useKeyboardShortcuts(shortcuts, true);

  useEffect(() => {
    const path = location.split('/')[1] || 'home';
    const pageName = path.charAt(0).toUpperCase() + path.slice(1);
    announce(`Navigated to ${pageName} page`);
  }, [location]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        document.body.classList.add('keyboard-navigating');
      }
    };

    const handleMouseDown = () => {
      document.body.classList.remove('keyboard-navigating');
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  useEffect(() => {
    const preventDefaultDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
      }
    };

    const preventDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
      }
    };

    window.addEventListener('dragover', preventDragOver);
    window.addEventListener('drop', preventDefaultDrop);

    return () => {
      window.removeEventListener('dragover', preventDragOver);
      window.removeEventListener('drop', preventDefaultDrop);
    };
  }, []);

  useEffect(() => {
    const cleanup = setupLinkPrefetching();
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    prefetchAdjacentRoutes(location);
  }, [location]);

  return (
    <>
      <ScrollToTop />
      <SkipLinks />
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <KeyboardShortcutsDialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog} />
        </Suspense>
      </ErrorBoundary>
      <Router />
    </>
  );
}

function AIAssistantManager() {
  const { user } = useAuth();
  return user ? <AIAssistantPersonalized /> : <AIAssistantPublic />;
}

function NPSSurveyManager() {
  const { visible, dismiss, complete } = useNPSSurvey();
  if (!visible) return null;
  return <NPSSurvey onDismiss={dismiss} onSubmit={complete} />;
}

function App() {
  useAutoUpdate();

  return (
    /* OfflineProvider lives at the root of the tree (see main.tsx) so that
       AuthProvider, PersistQueryClientProvider, and every layer below can
       consume offline state via useOffline(). */
    <UndoProvider maxHistorySize={100} persistToStorage={true}>
        <ShortcutProvider persistConfig={true}>
          <Toaster />
          {/* Security-critical — must start timers synchronously on first render */}
          <TokenRefreshHandler refreshInterval={5 * 60 * 1000} silentRefresh={true} />
          <InactivityManager />
          {/* Deferred UI — loaded after first paint, render nothing until ready.
              ErrorBoundary(fallback=null) ensures a failed chunk never crashes
              the core app — these components are progressive enhancement only. */}
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <CookieConsentBanner />
              <InstallBanner />
              <OAuthCallbackHandler />
              <DeepLinkHandler />
              <AIAssistantManager />
              <NPSSurveyManager />
              <UndoToast />
              <CommandPalette />
              <ShortcutGuide />
              <QuickActionBar position="bottom-right" />
              <ConnectionStatusBar />
            </Suspense>
          </ErrorBoundary>
          <div id="main-content" role="main" tabIndex={-1}>
            <ErrorBoundary>
              <Suspense
                fallback={
                  <div role="status" aria-label="Loading application">
                    <InstantSkeleton variant="page" />
                  </div>
                }
              >
                <AppWithKeyboardShortcuts />
              </Suspense>
            </ErrorBoundary>
          </div>
        </ShortcutProvider>
      </UndoProvider>
  );
}

export default App;
