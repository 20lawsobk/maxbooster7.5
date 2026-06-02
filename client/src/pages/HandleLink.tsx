import { logger } from "@/lib/logger";
import { useEffect } from "react";
import { useLocation } from "wouter";

const DEEP_LINK_ROUTES: Record<string, string> = {
  dashboard: "/dashboard",
  studio: "/studio",
  distribution: "/distribution",
  marketplace: "/marketplace",
  analytics: "/analytics",
  settings: "/settings",
  profile: "/profile",
};

export default function HandleLink() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deepLink = params.get("url");

    if (deepLink) {
      try {
        const cleaned = deepLink.replace(/^(web\+)?maxbooster:\/\//, "");
        const [route, ...pathParams] = cleaned.split("/");

        const targetPath = DEEP_LINK_ROUTES[route];
        if (targetPath) {
          const fullPath =
            pathParams.length > 0
              ? `${targetPath}/${pathParams.join("/")}`
              : targetPath;
          setLocation(fullPath);
          return;
        }
      } catch (error) {
        logger.error("[HandleLink] Failed to parse deep link:", error);
      }
    }

    setLocation("/dashboard");
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}
