import { build } from "esbuild";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLIENT_SRC = path.join(ROOT, "client", "src");
const SUBSCRIBE_SOURCE = path.join(CLIENT_SRC, "pages", "Subscribe.tsx");

export function createBootstrapScenarioReservation() {
  const reserved = new Set();
  return (scenario) => {
    if (reserved.has(scenario)) return false;
    reserved.add(scenario);
    return true;
  };
}

const isolatedModules = {
  "@/hooks/useAuth": `
    export function useAuth() {
      return { user: { username: "Stripe browser fixture" } };
    }
  `,
  "@/hooks/use-toast": `
    const titles = new Set([
      "Payment Failed",
      "Payment Successful!",
      "Payment Processing",
      "Additional Verification Required",
      "Payment Error"
    ]);
    const variants = new Set(["default", "destructive"]);
    function postIndicator(payload) {
      try {
        void fetch("/indicator", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store"
        }).catch(() => {});
      } catch {}
    }
    export function useToast() {
      return {
        toast(options) {
          const title = titles.has(options?.title) ? options.title : null;
          const variant = variants.has(options?.variant) ? options.variant : "default";
          if (!title) return;
          postIndicator({
            scenario: window.__paymentFixtureScenario,
            toast: { title, variant }
          });
        }
      };
    }
  `,
  "@/lib/queryClient": `
    export async function apiRequest() {
      throw new Error("Application API is unavailable in the isolated browser fixture.");
    }
  `,
  "wouter": `
    import React from "react";
    const destinations = new Set([
      "/dashboard?payment=success",
      "/dashboard?payment=processing"
    ]);
    function postIndicator(payload) {
      try {
        void fetch("/indicator", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store"
        }).catch(() => {});
      } catch {}
    }
    export function useLocation() {
      return [
        window.location.pathname,
        (path) => {
          if (!destinations.has(path)) return;
          postIndicator({
            scenario: window.__paymentFixtureScenario,
            navigationPath: path
          });
        }
      ];
    }
    export function useParams() {
      return { tier: "monthly" };
    }
    export function Link({ href, onClick, children, ...props }) {
      return React.createElement("a", {
        ...props,
        href,
        onClick(event) {
          event.preventDefault();
          onClick?.(event);
        }
      }, children);
    }
  `,
};

const entrySource = `
  import React, { useEffect, useState } from "react";
  import { createRoot } from "react-dom/client";
  import { Elements } from "@stripe/react-stripe-js";
  import { loadStripe } from "@stripe/stripe-js";
  import { SubscribeForm } from "./client/src/pages/Subscribe.tsx";

  function FixtureApp() {
    const scenario = window.__paymentFixtureScenario;
    const [configuration, setConfiguration] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
      let mounted = true;
      fetch("/bootstrap?scenario=" + encodeURIComponent(scenario), {
        cache: "no-store",
        credentials: "same-origin"
      })
        .then((response) => {
          if (!response.ok) throw new Error("Fixture bootstrap failed.");
          return response.json();
        })
        .then((data) => {
          if (mounted) setConfiguration(data);
        })
        .catch(() => {
          if (mounted) setFailed(true);
        });
      return () => { mounted = false; };
    }, [scenario]);

    if (failed) {
      return React.createElement("p", { role: "alert" },
        "Stripe test fixture setup failed. Check server readiness and retry.");
    }
    if (!configuration) {
      return React.createElement("p", { role: "status" },
        "Preparing an isolated Stripe test payment…");
    }

    const stripePromise = loadStripe(configuration.publishableKey);
    return React.createElement(
      Elements,
      { stripe: stripePromise, options: { clientSecret: configuration.clientSecret } },
      React.createElement(SubscribeForm, {
        plan: {
          id: "browser-fixture",
          name: "Isolated browser payment",
          price: 1,
          period: "once"
        }
      })
    );
  }

  createRoot(document.getElementById("subscribe-form-root")).render(
    React.createElement(FixtureApp)
  );
`;

export async function buildSubscribeFormBrowserBundle() {
  const output = await build({
    stdin: {
      contents: entrySource,
      resolveDir: ROOT,
      sourcefile: "browser-fixture-entry.jsx",
      loader: "jsx",
    },
    absWorkingDir: ROOT,
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    target: ["es2022"],
    minify: true,
    legalComments: "none",
    define: {
      "import.meta.env.VITE_STRIPE_PUBLIC_KEY": '""',
      "process.env.NODE_ENV": '"production"',
    },
    plugins: [{
      name: "isolated-subscribe-form-browser-fixture",
      setup(buildContext) {
        buildContext.onResolve({ filter: /^wouter$/ }, () => ({
          path: "wouter",
          namespace: "browser-fixture-stub",
        }));

        buildContext.onResolve({ filter: /^@\// }, (args) => {
          if (Object.hasOwn(isolatedModules, args.path)) {
            return { path: args.path, namespace: "browser-fixture-stub" };
          }
          const basePath = path.resolve(CLIENT_SRC, args.path.slice(2));
          for (const suffix of ["", ".tsx", ".ts", ".jsx", ".js", ".json"]) {
            const candidate = `${basePath}${suffix}`;
            if (existsSync(candidate)) return { path: candidate };
          }
          for (const suffix of [".tsx", ".ts", ".jsx", ".js"]) {
            const candidate = path.join(basePath, `index${suffix}`);
            if (existsSync(candidate)) return { path: candidate };
          }
          return { errors: [{ text: "Local application module was not found." }] };
        });

        buildContext.onLoad(
          { filter: /.*/, namespace: "browser-fixture-stub" },
          (args) => ({
            contents: isolatedModules[args.path],
            loader: "js",
            resolveDir: ROOT,
          }),
        );

        buildContext.onLoad({ filter: /Subscribe\.tsx$/ }, async () => {
          const { readFile } = await import("node:fs/promises");
          const source = await readFile(SUBSCRIBE_SOURCE, "utf8");
          return {
            contents: `${source}\nexport { SubscribeForm, getPaymentErrorMessage };\n`,
            loader: "tsx",
            resolveDir: CLIENT_SRC,
          };
        });
      },
    }],
    logLevel: "silent",
  });

  const bundle = output.outputFiles[0]?.text;
  if (!bundle) throw new Error("SubscribeForm browser fixture bundle was empty.");
  return bundle;
}