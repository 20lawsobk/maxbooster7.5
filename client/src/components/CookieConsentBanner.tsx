import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const COOKIE_CONSENT_KEY = 'max_booster_cookie_consent';

export function CookieConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    setIsVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'rejected');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[60] p-3 sm:p-4"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      role="dialog"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-description"
    >
      <Card className="max-w-3xl mx-auto bg-zinc-900/95 border-zinc-800 backdrop-blur-md shadow-2xl">
        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-3">
            <h2
              id="cookie-banner-title"
              className="text-base font-semibold text-white"
            >
              Cookie & Privacy Notice
            </h2>
            <p
              id="cookie-banner-description"
              className="text-sm text-zinc-300 leading-relaxed"
            >
              We use essential cookies for authentication and session management.{' '}
              <a
                href="/privacy"
                className="text-blue-400 hover:text-blue-300 underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Learn more
              </a>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleAccept}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                aria-label="Accept cookies"
              >
                Accept All
              </Button>
              <Button
                onClick={handleReject}
                variant="outline"
                size="sm"
                className="border-zinc-700 text-white hover:bg-zinc-800"
                aria-label="Accept essential cookies only"
              >
                Essential Only
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
