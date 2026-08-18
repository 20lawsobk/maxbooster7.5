// @ts-nocheck
import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const checkInstalled = () => {
      const isStandalone =
        window?.matchMedia("(display-mode: standalone)").matches ||
        (window?.navigator as Record<string, unknown>).standalone === true;
      setIsInstalled(isStandalone);
    };
    checkInstalled();

    const handleBeforeInstall = (e: Event) => {
      e?.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setInstallPrompt(null);
    };

    window?.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window?.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window?.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window?.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!installPrompt) return false;

    await installPrompt?.prompt();
    const { outcome } = await installPrompt?.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
      setIsInstallable(false);
    }

    setInstallPrompt(null);
    return outcome === "accepted";
  };

  return {
    isInstallable,
    isInstalled,
    promptInstall,
  };
}
