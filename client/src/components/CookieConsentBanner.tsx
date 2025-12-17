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
      className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-black/90 to-transparent"
      role="dialog"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-description"
    >
      <Card className="max-w-4xl mx-auto bg-zinc-900/95 border-zinc-800 backdrop-blur-sm">
        <div className="p-6">
          <div className="flex flex-col gap-4">
            <h2
              id="cookie-banner-title"
              className="text-lg font-semibold text-white"
            >
              Cookie & Privacy Notice
            </h2>
            <p
              id="cookie-banner-description"
              className="text-sm text-zinc-300"
            >
              We use essential cookies to provide our services and improve your experience. 
              By clicking "Accept", you consent to the use of cookies for authentication, 
              session management, and platform functionality. You can reject non-essential cookies, 
              though some features may be limited.{' '}
              <a
                href="/privacy"
                className="text-blue-400 hover:text-blue-300 underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Learn more in our Privacy Policy
              </a>
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleAccept}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                aria-label="Accept cookies"
              >
                Accept All
              </Button>
              <Button
                onClick={handleReject}
                variant="outline"
                className="border-zinc-700 text-white hover:bg-zinc-800"
                aria-label="Reject non-essential cookies"
              >
                Reject Non-Essential
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
