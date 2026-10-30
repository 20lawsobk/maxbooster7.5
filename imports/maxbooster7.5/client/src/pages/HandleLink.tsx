import { useEffect, useState } from "react";
import { useLocation } from "wouter";

const DEEP_LINK_ROUTES: Record<string, string> = {
  dashboard: "/dashboard",
  studio: "/studio",
  distribution: "/distribution",
  marketplace: "/marketplace",
  analytics: "/analytics",
  settings: "/settings",
  profile: "/settings",
};

function resolveDeepLink(deepLink: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(deepLink);
  } catch {
    return null;
  }

  if (
    (parsed.protocol !== "maxbooster:" &&
      parsed.protocol !== "web+maxbooster:") ||
    !parsed.hostname
  ) {
    return null;
  }

  const targetPath = DEEP_LINK_ROUTES[parsed.hostname];
  if (!targetPath) {
    return null;
  }

  const nestedPath = parsed.pathname === "/" ? "" : parsed.pathname;
  if (parsed.hostname === "profile") {
    const searchParams = new URLSearchParams(parsed.search);
    searchParams.set("tab", "profile");
    return `${targetPath}${nestedPath}?${searchParams.toString()}${parsed.hash}`;
  }

  return `${targetPath}${nestedPath}${parsed.search}${parsed.hash}`;
}

export default function HandleLink() {
  const [, setLocation] = useLocation();
  const [isInvalidLink, setIsInvalidLink] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deepLink = params.get("url");
    const destination = deepLink ? resolveDeepLink(deepLink) : null;

    if (destination) {
      setLocation(destination);
      return;
    }

    setIsInvalidLink(true);
  }, [setLocation]);

  if (isInvalidLink) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-6">
        <section
          className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm"
          aria-labelledby="invalid-link-title"
        >
          <h1 id="invalid-link-title" className="text-xl font-semibold">
            Link not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This Max Booster link is invalid or is no longer available.
          </p>
          <button
            type="button"
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => setLocation("/dashboard")}
          >
            Go to dashboard
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center bg-background"
      role="status"
      aria-label="Opening Max Booster link"
    >
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </main>
  );
}
