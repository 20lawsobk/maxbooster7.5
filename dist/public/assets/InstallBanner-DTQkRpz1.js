import {
  r as t,
  f as e,
  ac as w,
  d2 as N,
  bg as b,
} from "./vendor-react-31oK5L0i.js";
import { j as d } from "./studio-DOUfHW5v.js";
import { a as x } from "./index-D5xLbTBZ.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
function I() {
  const [n, l] = t.useState(null),
    [u, i] = t.useState(!1),
    [m, a] = t.useState(!1);
  return (
    t.useEffect(() => {
      (() => {
        const s =
          window.matchMedia("(display-mode: standalone)").matches ||
          window.navigator.standalone === !0;
        i(s);
      })();
      const o = (s) => {
          (s.preventDefault(), l(s), a(!0));
        },
        c = () => {
          (i(!0), a(!1), l(null));
        };
      return (
        window.addEventListener("beforeinstallprompt", o),
        window.addEventListener("appinstalled", c),
        () => {
          (window.removeEventListener("beforeinstallprompt", o),
            window.removeEventListener("appinstalled", c));
        }
      );
    }, []),
    {
      isInstallable: m,
      isInstalled: u,
      promptInstall: async () => {
        if (!n) return !1;
        await n.prompt();
        const { outcome: r } = await n.userChoice;
        return (r === "accepted" && (i(!0), a(!1)), l(null), r === "accepted");
      },
    }
  );
}
const h = "pwa-install-dismissed",
  v = 10080 * 60 * 1e3;
function S() {
  const { isInstallable: n, isInstalled: l, promptInstall: u } = I(),
    { user: i } = x(),
    [m, a] = t.useState(!0),
    [p, r] = t.useState(!1);
  (t.useEffect(() => {
    const s = localStorage.getItem(h);
    if (s) {
      const f = parseInt(s, 10);
      if (Date.now() - f < v) {
        a(!0);
        return;
      }
    }
    a(!1);
  }, []),
    t.useEffect(() => {
      if (n && !l && !m) {
        const s = setTimeout(() => r(!0), 500);
        return () => clearTimeout(s);
      } else r(!1);
    }, [n, l, m]));
  const o = () => {
      (r(!1),
        setTimeout(() => {
          (localStorage.setItem(h, Date.now().toString()), a(!0));
        }, 300));
    },
    c = async () => {
      (await u()) || o();
    };
  return !n || l || m || !i
    ? null
    : e.jsxDEV(
        "div",
        {
          className: `fixed bottom-0 left-0 right-0 z-[55] p-3 sm:p-4 transition-transform duration-300 ease-out ${p ? "translate-y-0" : "translate-y-full"}`,
          style: {
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
          },
          children: e.jsxDEV(
            "div",
            {
              className: "max-w-lg mx-auto",
              children: e.jsxDEV(
                "div",
                {
                  className:
                    "relative overflow-hidden rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl shadow-2xl",
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className:
                          "absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                        lineNumber: 65,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className: "relative p-4",
                        children: [
                          e.jsxDEV(
                            "button",
                            {
                              onClick: o,
                              className:
                                "absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors",
                              "aria-label": "Dismiss install banner",
                              children: e.jsxDEV(
                                w,
                                { className: "w-4 h-4 text-gray-400" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                                  lineNumber: 72,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                              lineNumber: 67,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center gap-4",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg",
                                    children: e.jsxDEV(
                                      N,
                                      { className: "w-7 h-7 text-white" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                                        lineNumber: 77,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                                    lineNumber: 76,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex-1 min-w-0 pr-6",
                                    children: [
                                      e.jsxDEV(
                                        "h3",
                                        {
                                          className:
                                            "text-white font-semibold text-base",
                                          children: "Install Max Booster",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                                          lineNumber: 81,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "text-gray-400 text-sm mt-0.5 line-clamp-2",
                                          children:
                                            "Get quick access and work offline with our app",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                                          lineNumber: 84,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                                    lineNumber: 80,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                              lineNumber: 75,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "div",
                            {
                              className: "flex gap-3 mt-4",
                              children: [
                                e.jsxDEV(
                                  d,
                                  {
                                    variant: "ghost",
                                    size: "sm",
                                    onClick: o,
                                    className:
                                      "flex-1 text-gray-400 hover:text-white hover:bg-white/10",
                                    children: "Not now",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                                    lineNumber: 91,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  d,
                                  {
                                    size: "sm",
                                    onClick: c,
                                    className:
                                      "flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0",
                                    children: [
                                      e.jsxDEV(
                                        b,
                                        { className: "w-4 h-4 mr-2" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                                          lineNumber: 104,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      "Install",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                                    lineNumber: 99,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                              lineNumber: 90,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        ],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                        lineNumber: 66,
                        columnNumber: 11,
                      },
                      this,
                    ),
                  ],
                },
                void 0,
                !0,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
                  lineNumber: 64,
                  columnNumber: 9,
                },
                this,
              ),
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
              lineNumber: 63,
              columnNumber: 7,
            },
            this,
          ),
        },
        void 0,
        !1,
        {
          fileName:
            "/home/runner/workspace/client/src/components/pwa/InstallBanner.tsx",
          lineNumber: 57,
          columnNumber: 5,
        },
        this,
      );
}
export { S as InstallBanner };
