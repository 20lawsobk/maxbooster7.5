import { useState, useEffect } from 'react';
import { X, Download, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useAuth } from '@/hooks/useAuth';

const DISMISSAL_KEY = 'pwa-install-dismissed';
const DISMISSAL_DURATION = 7 * 24 * 60 * 60 * 1000;

export function InstallBanner() {
  const { isInstallable, isInstalled, promptInstall } = usePWAInstall();
  const { user } = useAuth();
  const [isDismissed, setIsDismissed] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const dismissedAt = localStorage.getItem(DISMISSAL_KEY);
    if (dismissedAt) {
      const dismissTime = parseInt(dismissedAt, 10);
      if (Date.now() - dismissTime < DISMISSAL_DURATION) {
        setIsDismissed(true);
        return;
      }
    }
    setIsDismissed(false);
  }, []);

  useEffect(() => {
    if (isInstallable && !isInstalled && !isDismissed) {
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isInstallable, isInstalled, isDismissed]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      localStorage.setItem(DISMISSAL_KEY, Date.now().toString());
      setIsDismissed(true);
    }, 300);
  };

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (!accepted) {
      handleDismiss();
    }
  };

  if (!isInstallable || isInstalled || isDismissed || !user) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[55] p-3 sm:p-4 transition-transform duration-300 ease-out ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="max-w-lg mx-auto">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10" />
          <div className="relative p-4">
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors"
              aria-label="Dismiss install banner"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>

            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Smartphone className="w-7 h-7 text-white" />
              </div>

              <div className="flex-1 min-w-0 pr-6">
                <h3 className="text-white font-semibold text-base">
                  Install Max Booster
                </h3>
                <p className="text-gray-400 text-sm mt-0.5 line-clamp-2">
                  Get quick access and work offline with our app
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="flex-1 text-gray-400 hover:text-white hover:bg-white/10"
              >
                Not now
              </Button>
              <Button
                size="sm"
                onClick={handleInstall}
                className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0"
              >
                <Download className="w-4 h-4 mr-2" />
                Install
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
