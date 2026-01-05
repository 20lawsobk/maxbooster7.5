import { lazy, Suspense, useState, useEffect } from 'react';
import { Switch, Route, useLocation } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { KeyboardShortcutsDialog } from '@/components/dialogs/KeyboardShortcutsDialog';
import { SkipLinks } from '@/components/SkipLinks';
import { CookieConsentBanner } from '@/components/CookieConsentBanner';
import { AIAssistantPublic } from '@/components/support/AIAssistantPublic';
import { AIAssistantPersonalized } from '@/components/support/AIAssistantPersonalized';
import { useAuth } from '@/hooks/useAuth';
import { useKeyboardShortcuts, announce } from '@/lib/accessibility';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import RegisterPayment from '@/pages/RegisterPayment';
import RegisterSuccess from '@/pages/RegisterSuccess';
import Terms from '@/pages/Terms';
import Privacy from '@/pages/Privacy';
import Features from '@/pages/Features';
import API from '@/pages/API';
import Documentation from '@/pages/Documentation';
import About from '@/pages/About';
import Blog from '@/pages/Blog';
import SoloFounderStory from '@/pages/SoloFounderStory';
import SecurityPage from '@/pages/SecurityPage';
import DMCA from '@/pages/DMCA';
import ForgotPassword from '@/pages/ForgotPassword';
import NotFound from '@/pages/not-found';

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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
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
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin" component={Admin} />
      <Route path="/settings" component={Settings} />
      <Route path="/features" component={Features} />
      <Route path="/api-docs" component={API} />
      <Route path="/documentation" component={Documentation} />
      <Route path="/about" component={About} />
      <Route path="/blog" component={Blog} />
      <Route path="/solo-founder-story" component={SoloFounderStory} />
      <Route path="/security" component={SecurityPage} />
      <Route path="/dmca" component={DMCA} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/help" component={Help} />
      <Route path="/storefront" component={Storefront} />
      <Route path="/admin/autonomy" component={AdminAutonomy} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppWithKeyboardShortcuts() {
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  const [location, setLocation] = useLocation();

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

  return (
    <>
      <SkipLinks />
      <KeyboardShortcutsDialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog} />
      <Router />
    </>
  );
}

function AIAssistantManager() {
  const { user } = useAuth();
  return user ? <AIAssistantPersonalized /> : <AIAssistantPublic />;
}

function App() {
  return (
    <>
      <Toaster />
      <CookieConsentBanner />
      <AIAssistantManager />
      <div id="main-content" role="main" tabIndex={-1}>
        <Suspense
          fallback={
            <div
              className="min-h-screen flex items-center justify-center"
              role="status"
              aria-label="Loading application"
            >
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          }
        >
          <AppWithKeyboardShortcuts />
        </Suspense>
      </div>
    </>
  );
}

export default App;
