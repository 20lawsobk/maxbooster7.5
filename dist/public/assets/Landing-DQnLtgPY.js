import {
  r as o,
  aY as E,
  b7 as L,
  cT as V,
  aO as M,
  cU as I,
  f as e,
  cV as t,
  bb as w,
  cW as T,
  aR as z,
  cv as j,
  cX as A,
  bf as $,
  a$ as B,
  cY as R,
  cZ as C,
  c_ as q,
  aM as k,
  c2 as G,
  v as F,
  c$ as O,
  N as Y,
  aQ as W,
} from "./vendor-react-31oK5L0i.js";
import {
  u as H,
  j as l,
  B as D,
  o as J,
  p as Z,
  r as U,
  v as K,
  w as _,
} from "./studio-DOUfHW5v.js";
import { L as S } from "./Logo-DS4JhmIC.js";
import { S as X, a as Q, b as ee, c as ne, d as se } from "./sheet-DTRVkwak.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
const m = [
    {
      title: "AI-Powered Studio",
      description:
        "Professional DAW with AI mixing, mastering, and 1000+ plugins. Create studio-quality music in your browser.",
      icon: E,
      gradient: "from-blue-600 to-cyan-500",
    },
    {
      title: "Analytics Dashboard",
      description:
        "Track streams, revenue, and fan growth across all platforms. AI-powered insights to grow your career.",
      icon: L,
      gradient: "from-purple-600 to-pink-500",
    },
    {
      title: "Social Media Autopilot",
      description:
        "AI schedules and creates content across all platforms. Grow your audience on autopilot 24/7.",
      icon: V,
      gradient: "from-green-600 to-teal-500",
    },
    {
      title: "Music Distribution",
      description:
        "Release to Spotify, Apple Music, and 150+ platforms. Keep 100% of your royalties.",
      icon: M,
      gradient: "from-orange-600 to-red-500",
    },
    {
      title: "Beat Marketplace",
      description:
        "Sell beats and samples directly to artists. Built-in licensing and secure payments.",
      icon: I,
      gradient: "from-indigo-600 to-blue-500",
    },
  ],
  re = [
    { label: "AI-Powered Features", value: "15+", icon: B },
    { label: "Platforms Supported", value: "150+", icon: R },
    { label: "Money-Back Guarantee", value: "90 Days", icon: j },
    { label: "Integrated Tools", value: "7+", icon: C },
  ],
  ie = [
    {
      icon: E,
      title: "AI Studio & Mastering",
      description:
        "Create, mix, and master your tracks with AI assistance. Professional quality results in minutes, not days.",
      color: "from-cyan-500 to-blue-600",
      glow: "rgba(6,182,212,0.3)",
    },
    {
      icon: L,
      title: "Advanced Analytics",
      description:
        "Track your performance across all platforms with AI-powered predictions and real-time revenue forecasts.",
      color: "from-violet-500 to-purple-600",
      glow: "rgba(139,92,246,0.3)",
    },
    {
      icon: V,
      title: "AI Social Media Manager",
      description:
        "AI-powered content creation and scheduling for every major platform with autonomous approval workflows.",
      color: "from-emerald-500 to-teal-600",
      glow: "rgba(16,185,129,0.3)",
    },
    {
      icon: q,
      title: "Organic Marketing Tools",
      description:
        "AI-assisted campaign creation and optimization through your connected social accounts — zero ad spend required.",
      color: "from-amber-500 to-orange-600",
      glow: "rgba(245,158,11,0.3)",
    },
    {
      icon: I,
      title: "Royalty Management",
      description:
        "Automated royalty collection and distribution with Stripe integration for instant, guaranteed payouts.",
      color: "from-blue-500 to-indigo-600",
      glow: "rgba(59,130,246,0.3)",
    },
    {
      icon: M,
      title: "Beat Marketplace",
      description:
        "Buy and sell beats with integrated peer-to-peer transactions, smart licensing, and zero platform fees.",
      color: "from-pink-500 to-rose-600",
      glow: "rgba(236,72,153,0.3)",
    },
  ],
  ae = [
    {
      name: "Monthly",
      price: "$49",
      period: "/month",
      description: "Perfect for getting started",
      features: [
        "All AI Tools",
        "Unlimited Projects",
        "Advanced Analytics",
        "Cloud Storage",
      ],
      popular: !1,
    },
    {
      name: "Yearly",
      price: "$468",
      period: "/year",
      originalPrice: "$588",
      description: "Billed annually ($39/month)",
      features: [
        "All AI Tools",
        "Unlimited Projects",
        "Advanced Analytics",
        "Cloud Storage",
      ],
      popular: !0,
    },
    {
      name: "Lifetime",
      price: "$699",
      period: "once",
      description: "Pay once, access forever",
      features: [
        "All AI Tools",
        "Unlimited Projects",
        "Advanced Analytics",
        "Cloud Storage",
      ],
      popular: !1,
    },
  ];
function le() {
  o.useEffect(() => {
    const d = new IntersectionObserver(
      (r) => {
        r.forEach((h) => {
          h.isIntersecting && h.target.classList.add("visible");
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    return (
      document.querySelectorAll(".reveal").forEach((r) => d.observe(r)),
      () => d.disconnect()
    );
  }, []);
}
const te = [
  {
    quote:
      "Max Booster is the only tool I need. My streams jumped 340% in 3 months. The AI social autopilot posts better content than my old social media manager.",
    name: "Marcus J.",
    role: "Independent Hip-Hop Artist",
    avatar: "MJ",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    quote:
      "I replaced 7 separate subscriptions with Max Booster. The analytics alone are worth the price — I finally understand which content actually drives sales.",
    name: "Priya K.",
    role: "Singer-Songwriter",
    avatar: "PK",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    quote:
      "The beat marketplace generated $8,400 in my first month. Zero platform fees means I keep every dollar. This platform is a game-changer for producers.",
    name: "DJ Sable",
    role: "Producer & Beat Maker",
    avatar: "DS",
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    quote:
      "As someone who hates social media, having AI create and schedule everything automatically felt like a superpower. My fanbase grew 5x without me touching it.",
    name: "Elena V.",
    role: "EDM Producer",
    avatar: "EV",
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    quote:
      "The AI mastering is legitimately pro-level. My mixes sound better than before I was paying $500/track at a studio. It's unreal what this thing can do.",
    name: "Tone Ray",
    role: "R&B Artist",
    avatar: "TR",
    gradient: "from-pink-500 to-rose-600",
  },
  {
    quote:
      "Signed my first sync licensing deal through Max Booster's pitch tools. The revenue intelligence showed me exactly which playlist editors to target.",
    name: "Zoe M.",
    role: "Indie Pop Artist",
    avatar: "ZM",
    gradient: "from-indigo-500 to-blue-600",
  },
];
function oe() {
  const d = o.useRef(null);
  return (
    o.useEffect(() => {
      const i = d.current;
      if (!i) return;
      const r = i.getContext("2d");
      if (!r) return;
      let h;
      const u = [],
        c = () => {
          ((i.width = i.offsetWidth), (i.height = i.offsetHeight));
        };
      (c(), window.addEventListener("resize", c));
      for (let s = 0; s < 80; s++)
        u.push({
          x: Math.random() * i.width,
          y: Math.random() * i.height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          size: Math.random() * 2 + 0.5,
          opacity: Math.random() * 0.6 + 0.1,
          hue: Math.random() > 0.5 ? 43 : 265,
        });
      const N = () => {
        (r.clearRect(0, 0, i.width, i.height),
          u.forEach((s, x) => {
            ((s.x += s.vx),
              (s.y += s.vy),
              s.x < 0 && (s.x = i.width),
              s.x > i.width && (s.x = 0),
              s.y < 0 && (s.y = i.height),
              s.y > i.height && (s.y = 0),
              r.beginPath(),
              r.arc(s.x, s.y, s.size, 0, Math.PI * 2),
              (r.fillStyle = `hsla(${s.hue}, 96%, 58%, ${s.opacity})`),
              r.fill(),
              u.slice(x + 1, x + 6).forEach((g) => {
                const p = s.x - g.x,
                  b = s.y - g.y,
                  f = Math.sqrt(p * p + b * b);
                f < 100 &&
                  (r.beginPath(),
                  (r.strokeStyle = `hsla(${s.hue}, 80%, 58%, ${0.08 * (1 - f / 100)})`),
                  (r.lineWidth = 0.5),
                  r.moveTo(s.x, s.y),
                  r.lineTo(g.x, g.y),
                  r.stroke());
              }));
          }),
          (h = requestAnimationFrame(N)));
      };
      return (
        N(),
        () => {
          (cancelAnimationFrame(h), window.removeEventListener("resize", c));
        }
      );
    }, []),
    e.jsxDEV(
      "canvas",
      {
        ref: d,
        className: "absolute inset-0 w-full h-full pointer-events-none",
      },
      void 0,
      !1,
      {
        fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
        lineNumber: 321,
        columnNumber: 10,
      },
      this,
    )
  );
}
function pe() {
  const { toast: d } = H(),
    [i, r] = o.useState(!1),
    [h, u] = o.useState(!1),
    [c, N] = o.useState(0),
    [s, x] = o.useState(!1),
    [g, p] = o.useState(!1);
  (le(),
    o.useEffect(() => {
      const n = () => p(window.scrollY > 20);
      return (
        window.addEventListener("scroll", n),
        () => window.removeEventListener("scroll", n)
      );
    }, []),
    o.useEffect(() => {
      if (!i) return;
      const n = setInterval(() => {
        N((a) => (a + 1) % m.length);
      }, 5e3);
      return () => clearInterval(n);
    }, [i]));
  const b = o.useCallback(() => N((n) => (n + 1) % m.length), []),
    f = o.useCallback(() => N((n) => (n - 1 + m.length) % m.length), []),
    P = async () => {
      x(!0);
      try {
        const n = await fetch("/api/auth/demo", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        n.ok
          ? (window.location.href = "/dashboard")
          : n.status === 429
            ? d({
                title: "Too many requests",
                description: "Please try again later.",
                variant: "destructive",
              })
            : r(!0);
      } catch {
        r(!0);
      } finally {
        x(!1);
      }
    };
  return e.jsxDEV(
    "div",
    {
      className:
        "min-h-screen landing-dark-bg text-white overflow-x-hidden page-enter",
      children: [
        e.jsxDEV(
          "nav",
          {
            className: `fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${g ? "landing-nav-scrolled" : "bg-transparent"}`,
            children: e.jsxDEV(
              "div",
              {
                className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8",
                children: e.jsxDEV(
                  "div",
                  {
                    className: "flex justify-between items-center h-16",
                    children: [
                      e.jsxDEV(
                        "div",
                        {
                          className: "flex items-center gap-3",
                          children: e.jsxDEV(
                            S,
                            { size: "md", className: "landing-logo-glow" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 382,
                              columnNumber: 15,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                          lineNumber: 381,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "div",
                        {
                          className:
                            "hidden sm:flex items-center space-x-1 md:space-x-2",
                          children: [
                            e.jsxDEV(
                              t,
                              {
                                href: "/features",
                                children: e.jsxDEV(
                                  l,
                                  {
                                    variant: "ghost",
                                    size: "sm",
                                    className: "landing-nav-link",
                                    children: "Features",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 387,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                lineNumber: 386,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              t,
                              {
                                href: "/pricing",
                                children: e.jsxDEV(
                                  l,
                                  {
                                    variant: "ghost",
                                    size: "sm",
                                    className: "landing-nav-link",
                                    children: "Pricing",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 392,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                lineNumber: 391,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              t,
                              {
                                href: "/login",
                                children: e.jsxDEV(
                                  l,
                                  {
                                    variant: "ghost",
                                    size: "sm",
                                    className: "landing-nav-link",
                                    children: "Sign In",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 397,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                lineNumber: 396,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              t,
                              {
                                href: "/pricing",
                                children: e.jsxDEV(
                                  l,
                                  {
                                    size: "sm",
                                    className: "landing-cta-btn",
                                    children: [
                                      "Get Started",
                                      e.jsxDEV(
                                        w,
                                        { className: "ml-1.5 h-3.5 w-3.5" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                                          lineNumber: 404,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 402,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                lineNumber: 401,
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
                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                          lineNumber: 385,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "div",
                        {
                          className: "flex sm:hidden items-center gap-2",
                          children: [
                            e.jsxDEV(
                              t,
                              {
                                href: "/pricing",
                                children: e.jsxDEV(
                                  l,
                                  {
                                    size: "sm",
                                    className: "landing-cta-btn text-xs px-3",
                                    children: "Get Started",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 411,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                lineNumber: 410,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              X,
                              {
                                open: h,
                                onOpenChange: u,
                                children: [
                                  e.jsxDEV(
                                    Q,
                                    {
                                      asChild: !0,
                                      children: e.jsxDEV(
                                        l,
                                        {
                                          variant: "ghost",
                                          size: "icon",
                                          className:
                                            "text-white/80 hover:text-white",
                                          children: e.jsxDEV(
                                            T,
                                            { className: "h-6 w-6" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                                              lineNumber: 418,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                                          lineNumber: 417,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                                      lineNumber: 416,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    ee,
                                    {
                                      side: "right",
                                      className: "w-64 landing-mobile-sheet",
                                      children: [
                                        e.jsxDEV(
                                          ne,
                                          {
                                            children: e.jsxDEV(
                                              se,
                                              {
                                                className: "text-white",
                                                children: "Menu",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                lineNumber: 423,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                                            lineNumber: 422,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "flex flex-col space-y-4 mt-8",
                                            children: [
                                              e.jsxDEV(
                                                t,
                                                {
                                                  href: "/features",
                                                  children: e.jsxDEV(
                                                    l,
                                                    {
                                                      variant: "ghost",
                                                      className:
                                                        "w-full justify-start text-white/80 hover:text-white",
                                                      onClick: () => u(!1),
                                                      children: "Features",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                      lineNumber: 427,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                  lineNumber: 426,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                t,
                                                {
                                                  href: "/pricing",
                                                  children: e.jsxDEV(
                                                    l,
                                                    {
                                                      variant: "ghost",
                                                      className:
                                                        "w-full justify-start text-white/80 hover:text-white",
                                                      onClick: () => u(!1),
                                                      children: "Pricing",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                      lineNumber: 432,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                  lineNumber: 431,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                t,
                                                {
                                                  href: "/login",
                                                  children: e.jsxDEV(
                                                    l,
                                                    {
                                                      variant: "ghost",
                                                      className:
                                                        "w-full justify-start text-white/80 hover:text-white",
                                                      onClick: () => u(!1),
                                                      children: "Sign In",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                      lineNumber: 437,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                  lineNumber: 436,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                t,
                                                {
                                                  href: "/pricing",
                                                  children: e.jsxDEV(
                                                    l,
                                                    {
                                                      className:
                                                        "w-full landing-cta-btn",
                                                      onClick: () => u(!1),
                                                      children: "Get Started",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                      lineNumber: 442,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                  lineNumber: 441,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                                            lineNumber: 425,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                                      lineNumber: 421,
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
                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                lineNumber: 415,
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
                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                          lineNumber: 409,
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
                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                    lineNumber: 380,
                    columnNumber: 11,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
                lineNumber: 379,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
            lineNumber: 378,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          "section",
          {
            className:
              "relative min-h-screen flex items-center justify-center px-4 pt-16 pb-20 sm:px-6 lg:px-8 overflow-hidden",
            children: [
              e.jsxDEV(
                oe,
                {},
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                  lineNumber: 456,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                "div",
                {
                  className: "absolute inset-0 pointer-events-none",
                  children: [
                    e.jsxDEV(
                      "div",
                      { className: "landing-orb-gold" },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 460,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      { className: "landing-orb-purple" },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 461,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      { className: "landing-grid-overlay" },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 462,
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
                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                  lineNumber: 459,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                "div",
                {
                  className: "relative z-10 max-w-6xl mx-auto text-center",
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className: "flex justify-center mb-8",
                        children: e.jsxDEV(
                          "span",
                          {
                            className: "landing-status-badge",
                            children: [
                              e.jsxDEV(
                                "span",
                                { className: "landing-status-dot" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 469,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                z,
                                { className: "h-3.5 w-3.5 text-amber-400" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 470,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                {
                                  children:
                                    "AI Systems Online — 90-Day Money-Back Guarantee",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 471,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                j,
                                { className: "h-3.5 w-3.5 text-emerald-400" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 472,
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
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 468,
                            columnNumber: 13,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 467,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "h1",
                      {
                        className:
                          "text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight mb-6 leading-none",
                        children: [
                          e.jsxDEV(
                            "span",
                            {
                              className:
                                "block text-white hero-text-animate hero-text-animate-1",
                              children: "Music Career",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 478,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "span",
                            {
                              className:
                                "block landing-hero-gradient hero-text-animate hero-text-animate-2",
                              children: "Management",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 479,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "span",
                            {
                              className:
                                "block text-white/90 text-4xl sm:text-5xl lg:text-6xl font-bold mt-2 hero-text-animate hero-text-animate-3",
                              children: [
                                "Powered by",
                                " ",
                                e.jsxDEV(
                                  "span",
                                  {
                                    className: "landing-ai-text",
                                    children: "AI",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 482,
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
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 480,
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
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 477,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "p",
                      {
                        className:
                          "text-lg sm:text-xl text-white/70 mb-10 max-w-3xl mx-auto leading-relaxed hero-text-animate hero-text-animate-4",
                        children:
                          "The most advanced music career platform ever built — AI Studio, Social Media Autopilot, Beat Marketplace, Analytics, and Distribution all in one place.",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 486,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className:
                          "flex flex-col sm:flex-row gap-4 justify-center mb-16",
                        children: [
                          e.jsxDEV(
                            t,
                            {
                              href: "/pricing",
                              children: e.jsxDEV(
                                l,
                                {
                                  size: "lg",
                                  className: "landing-primary-btn group",
                                  children: [
                                    e.jsxDEV(
                                      A,
                                      {
                                        className:
                                          "mr-2 h-5 w-5 group-hover:animate-bounce",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                                        lineNumber: 495,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    "Get Started — 90-Day Guarantee",
                                    e.jsxDEV(
                                      w,
                                      {
                                        className:
                                          "ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                                        lineNumber: 497,
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
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 494,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 493,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            l,
                            {
                              size: "lg",
                              className: "landing-secondary-btn",
                              onClick: P,
                              disabled: s,
                              "data-testid": "button-watch-demo",
                              children: s
                                ? e.jsxDEV(
                                    e.Fragment,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "mr-2 h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                                            lineNumber: 509,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        "Starting Demo…",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                                      lineNumber: 508,
                                      columnNumber: 17,
                                    },
                                    this,
                                  )
                                : e.jsxDEV(
                                    e.Fragment,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          $,
                                          { className: "mr-2 h-5 w-5" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                                            lineNumber: 514,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        "Try Live Demo",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                                      lineNumber: 513,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 500,
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
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 492,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className:
                          "grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto",
                        children: re.map((n, a) =>
                          e.jsxDEV(
                            "div",
                            {
                              className: "landing-stat-card",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "landing-stat-icon",
                                    children: e.jsxDEV(
                                      n.icon,
                                      { className: "h-5 w-5" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                                        lineNumber: 526,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 525,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "text-2xl sm:text-3xl font-black text-white",
                                    children: n.value,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 528,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-xs text-white/50 mt-0.5",
                                    children: n.label,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 529,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              ],
                            },
                            a,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 524,
                              columnNumber: 15,
                            },
                            this,
                          ),
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 522,
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
                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                  lineNumber: 465,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                "div",
                {
                  className:
                    "absolute bottom-8 left-1/2 -translate-x-1/2 landing-scroll-indicator",
                  children: e.jsxDEV(
                    "div",
                    { className: "landing-scroll-dot" },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                      lineNumber: 537,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                  lineNumber: 536,
                  columnNumber: 9,
                },
                this,
              ),
            ],
          },
          void 0,
          !0,
          {
            fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
            lineNumber: 455,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          "section",
          {
            className: "py-24 relative overflow-hidden landing-section-divider",
            children: [
              e.jsxDEV(
                "div",
                {
                  className:
                    "absolute inset-0 landing-features-bg pointer-events-none",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                  lineNumber: 543,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                "div",
                {
                  className:
                    "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10",
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className: "text-center mb-16 reveal",
                        children: [
                          e.jsxDEV(
                            D,
                            {
                              className: "landing-section-badge mb-4",
                              children: [
                                e.jsxDEV(
                                  C,
                                  { className: "h-3.5 w-3.5 mr-1.5" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 547,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                "Cutting-Edge Technology",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 546,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "h2",
                            {
                              className:
                                "text-4xl sm:text-5xl font-black text-white mb-4",
                              children: [
                                "Everything You Need to",
                                " ",
                                e.jsxDEV(
                                  "span",
                                  {
                                    className: "landing-hero-gradient",
                                    children: "Succeed",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 552,
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
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 550,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "p",
                            {
                              className:
                                "text-xl text-white/60 max-w-2xl mx-auto",
                              children:
                                "From creation to monetization — Max Booster is the unfair advantage every independent artist deserves.",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 554,
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
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 545,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className:
                          "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
                        children: ie.map((n, a) =>
                          e.jsxDEV(
                            "div",
                            {
                              className: `landing-feature-card group reveal reveal-delay-${(a % 3) + 1}`,
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "landing-feature-glow",
                                    style: { "--glow-color": n.glow },
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 562,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: `landing-feature-icon bg-gradient-to-br ${n.color}`,
                                    children: e.jsxDEV(
                                      n.icon,
                                      { className: "h-6 w-6 text-white" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                                        lineNumber: 564,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 563,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "h3",
                                  {
                                    className:
                                      "text-xl font-bold text-white mb-2 group-hover:text-amber-300 transition-colors",
                                    children: n.title,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 566,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "p",
                                  {
                                    className:
                                      "text-white/60 text-sm leading-relaxed",
                                    children: n.description,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 567,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  { className: "landing-feature-border" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 568,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              ],
                            },
                            a,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 561,
                              columnNumber: 15,
                            },
                            this,
                          ),
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 559,
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
                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                  lineNumber: 544,
                  columnNumber: 9,
                },
                this,
              ),
            ],
          },
          void 0,
          !0,
          {
            fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
            lineNumber: 542,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          "section",
          {
            className: "py-24 relative overflow-hidden landing-section-divider",
            children: [
              e.jsxDEV(
                "div",
                {
                  className: "absolute inset-0 pointer-events-none",
                  style: {
                    background:
                      "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(245,158,11,0.05) 0%, transparent 70%)",
                  },
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                  lineNumber: 577,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                "div",
                {
                  className:
                    "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10",
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className: "text-center mb-14 reveal",
                        children: [
                          e.jsxDEV(
                            D,
                            {
                              className: "landing-section-badge mb-4",
                              children: [
                                e.jsxDEV(
                                  k,
                                  { className: "h-3.5 w-3.5 mr-1.5" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 581,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                "Artist Success Stories",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 580,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "h2",
                            {
                              className:
                                "text-4xl sm:text-5xl font-black text-white mb-4",
                              children: [
                                "Artists Love",
                                " ",
                                e.jsxDEV(
                                  "span",
                                  {
                                    className: "landing-hero-gradient",
                                    children: "Max Booster",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 586,
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
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 584,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "p",
                            {
                              className:
                                "text-xl text-white/60 max-w-2xl mx-auto",
                              children:
                                "Join thousands of independent artists who are building unstoppable careers with AI.",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 588,
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
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 579,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className:
                          "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
                        children: te.map((n, a) =>
                          e.jsxDEV(
                            "div",
                            {
                              className: `landing-testimonial-card reveal reveal-delay-${(a % 3) + 1}`,
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex items-center gap-1 mb-4",
                                    children: [...Array(5)].map((y, v) =>
                                      e.jsxDEV(
                                        k,
                                        {
                                          className:
                                            "h-4 w-4 fill-amber-400 text-amber-400",
                                        },
                                        v,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                                          lineNumber: 597,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 595,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "p",
                                  {
                                    className:
                                      "text-white/75 text-sm leading-relaxed mb-6 italic",
                                    children: ['"', n.quote, '"'],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 600,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex items-center gap-3",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: `w-10 h-10 rounded-full bg-gradient-to-br ${n.gradient} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`,
                                          children: n.avatar,
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                                          lineNumber: 602,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          children: [
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-white text-sm font-semibold",
                                                children: n.name,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                lineNumber: 606,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-white/40 text-xs",
                                                children: n.role,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                lineNumber: 607,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                                          lineNumber: 605,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 601,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              ],
                            },
                            a,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 594,
                              columnNumber: 15,
                            },
                            this,
                          ),
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 592,
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
                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                  lineNumber: 578,
                  columnNumber: 9,
                },
                this,
              ),
            ],
          },
          void 0,
          !0,
          {
            fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
            lineNumber: 576,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          "section",
          {
            className: "py-24 relative overflow-hidden",
            children: [
              e.jsxDEV(
                "div",
                {
                  className:
                    "absolute inset-0 landing-pricing-bg pointer-events-none",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                  lineNumber: 618,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                "div",
                {
                  className:
                    "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center",
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className: "reveal",
                        children: [
                          e.jsxDEV(
                            D,
                            {
                              className: "landing-section-badge mb-4",
                              children: [
                                e.jsxDEV(
                                  G,
                                  { className: "h-3.5 w-3.5 mr-1.5" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 622,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                "Simple Pricing",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 621,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "h2",
                            {
                              className:
                                "text-4xl sm:text-5xl font-black text-white mb-4",
                              children: [
                                "Choose Your",
                                " ",
                                e.jsxDEV(
                                  "span",
                                  {
                                    className: "landing-hero-gradient",
                                    children: "Level",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 627,
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
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 625,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "p",
                            {
                              className:
                                "text-xl text-white/60 mb-16 max-w-2xl mx-auto",
                              children:
                                "All plans include every AI feature. No hidden fees, no paywalled tools.",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 629,
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
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 620,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className:
                          "grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto",
                        children: ae.map((n, a) =>
                          e.jsxDEV(
                            "div",
                            {
                              className: `landing-pricing-card reveal reveal-delay-${a + 1} ${n.popular ? "landing-pricing-popular" : ""}`,
                              children: [
                                n.popular &&
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className: "landing-popular-badge",
                                      children: [
                                        e.jsxDEV(
                                          k,
                                          { className: "h-3.5 w-3.5 mr-1" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                                            lineNumber: 642,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        "Most Popular",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                                      lineNumber: 641,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "p-6",
                                    children: [
                                      e.jsxDEV(
                                        "h3",
                                        {
                                          className:
                                            "text-lg font-bold text-white/80 mb-1",
                                          children: n.name,
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                                          lineNumber: 647,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: "mb-2",
                                          children: [
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "text-5xl font-black text-white",
                                                children: n.price,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                lineNumber: 649,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className: "text-white/40 ml-1",
                                                children: n.period,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                lineNumber: 650,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                                          lineNumber: 648,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      n.originalPrice &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "text-xs text-white/30 line-through mb-1",
                                            children: n.originalPrice,
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                                            lineNumber: 653,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "text-white/50 text-sm mb-6",
                                          children: n.description,
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                                          lineNumber: 655,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "ul",
                                        {
                                          className: "space-y-3 mb-6",
                                          children: n.features.map((y, v) =>
                                            e.jsxDEV(
                                              "li",
                                              {
                                                className:
                                                  "flex items-center gap-2 text-sm text-white/70",
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "h-4 w-4 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0",
                                                      children: e.jsxDEV(
                                                        F,
                                                        {
                                                          className:
                                                            "h-2.5 w-2.5 text-emerald-400",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                          lineNumber: 660,
                                                          columnNumber: 27,
                                                        },
                                                        this,
                                                      ),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                      lineNumber: 659,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                                  y,
                                                ],
                                              },
                                              v,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                lineNumber: 658,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                                          lineNumber: 656,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        t,
                                        {
                                          href: `/register/payment/${n.name.toLowerCase()}`,
                                          children: e.jsxDEV(
                                            l,
                                            {
                                              className: `w-full ${n.popular ? "landing-cta-btn" : "landing-pricing-outline-btn"}`,
                                              children: "Get Started",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                                              lineNumber: 667,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Landing.tsx",
                                          lineNumber: 666,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 646,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              ],
                            },
                            a,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 636,
                              columnNumber: 15,
                            },
                            this,
                          ),
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 634,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className: "mt-10",
                        children: e.jsxDEV(
                          t,
                          {
                            href: "/pricing",
                            children: e.jsxDEV(
                              l,
                              {
                                variant: "ghost",
                                size: "lg",
                                className: "text-white/50 hover:text-white",
                                children: [
                                  "View Detailed Pricing",
                                  e.jsxDEV(
                                    w,
                                    { className: "ml-2 h-5 w-5" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                                      lineNumber: 680,
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
                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                lineNumber: 678,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 677,
                            columnNumber: 13,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 676,
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
                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                  lineNumber: 619,
                  columnNumber: 9,
                },
                this,
              ),
            ],
          },
          void 0,
          !0,
          {
            fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
            lineNumber: 617,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          "section",
          {
            className: "py-24 landing-section-divider",
            children: e.jsxDEV(
              "div",
              {
                className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8",
                children: [
                  e.jsxDEV(
                    "div",
                    {
                      className: "text-center mb-16 reveal",
                      children: [
                        e.jsxDEV(
                          "h2",
                          {
                            className:
                              "text-4xl sm:text-5xl font-black text-white mb-4",
                            children: [
                              "What's ",
                              e.jsxDEV(
                                "span",
                                {
                                  className: "landing-hero-gradient",
                                  children: "Included",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 692,
                                  columnNumber: 22,
                                },
                                this,
                              ),
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 691,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-xl text-white/60",
                            children:
                              "Everything to create, promote, and monetize your music",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 694,
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
                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                      lineNumber: 690,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "grid grid-cols-1 md:grid-cols-3 gap-6",
                      children: [
                        {
                          icon: E,
                          title: "AI-Powered Studio",
                          content:
                            "Professional DAW with AI mixing and mastering tools, multi-track editing, effects, and cloud storage for all your projects.",
                          color: "from-cyan-500 to-blue-600",
                        },
                        {
                          icon: V,
                          title: "Social Media Manager",
                          content:
                            "Connect Facebook, Instagram, X, TikTok, LinkedIn, Threads, and YouTube. AI-assisted content creation with approval workflows.",
                          color: "from-violet-500 to-purple-600",
                        },
                        {
                          icon: L,
                          title: "Advanced Analytics",
                          content:
                            "Track performance across all platforms with AI-powered predictions, churn detection, revenue forecasts, and detailed insights.",
                          color: "from-amber-500 to-orange-600",
                        },
                      ].map((n, a) =>
                        e.jsxDEV(
                          "div",
                          {
                            className: `landing-include-card reveal reveal-delay-${a + 1}`,
                            children: [
                              e.jsxDEV(
                                "div",
                                {
                                  className: `landing-include-icon bg-gradient-to-br ${n.color}`,
                                  children: e.jsxDEV(
                                    n.icon,
                                    { className: "h-7 w-7 text-white" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                                      lineNumber: 720,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 719,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "h3",
                                {
                                  className:
                                    "text-xl font-bold text-white mb-3",
                                  children: n.title,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 722,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "p",
                                {
                                  className:
                                    "text-white/50 text-sm leading-relaxed",
                                  children: n.content,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 723,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                            ],
                          },
                          a,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 718,
                            columnNumber: 15,
                          },
                          this,
                        ),
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                      lineNumber: 697,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
                lineNumber: 689,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
            lineNumber: 688,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          "section",
          {
            className: "py-24 relative overflow-hidden",
            children: [
              e.jsxDEV(
                "div",
                { className: "landing-cta-bg" },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                  lineNumber: 732,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                "div",
                {
                  className:
                    "max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8 relative z-10 reveal",
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className: "flex justify-center mb-6",
                        children: e.jsxDEV(
                          "span",
                          {
                            className: "landing-status-badge",
                            children: [
                              e.jsxDEV(
                                j,
                                { className: "h-4 w-4 text-emerald-400" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 736,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              "90-Day Money Back Guarantee",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 735,
                            columnNumber: 13,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 734,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "h2",
                      {
                        className:
                          "text-4xl sm:text-5xl font-black text-white mb-4",
                        children: [
                          "Ready to ",
                          e.jsxDEV(
                            "span",
                            {
                              className: "landing-hero-gradient",
                              children: "Dominate",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Landing.tsx",
                              lineNumber: 741,
                              columnNumber: 22,
                            },
                            this,
                          ),
                          "?",
                        ],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 740,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "p",
                      {
                        className: "text-xl text-white/65 mb-10",
                        children:
                          "Join thousands of independent artists using Max Booster to build unstoppable music careers. Protected by our 90-day money-back guarantee.",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 743,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      t,
                      {
                        href: "/pricing",
                        children: e.jsxDEV(
                          l,
                          {
                            size: "lg",
                            className:
                              "landing-primary-btn group px-10 py-6 text-lg",
                            children: [
                              e.jsxDEV(
                                A,
                                {
                                  className:
                                    "mr-2 h-5 w-5 group-hover:animate-bounce",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 749,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              "Get Started — 90-Day Guarantee",
                              e.jsxDEV(
                                w,
                                {
                                  className:
                                    "ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 751,
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
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 748,
                            columnNumber: 13,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 747,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "p",
                      {
                        className: "text-sm mt-6 text-white/30",
                        children:
                          "Secure payment • Cancel anytime • 100% money back within 90 days",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                        lineNumber: 754,
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
                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                  lineNumber: 733,
                  columnNumber: 9,
                },
                this,
              ),
            ],
          },
          void 0,
          !0,
          {
            fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
            lineNumber: 731,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          J,
          {
            open: i,
            onOpenChange: r,
            children: e.jsxDEV(
              Z,
              {
                className: "max-w-5xl p-0 landing-demo-modal",
                children: [
                  e.jsxDEV(
                    U,
                    {
                      className: "p-6 pb-2",
                      children: [
                        e.jsxDEV(
                          K,
                          { className: "text-white", children: m[c].title },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 764,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          _,
                          {
                            className: "text-white/50",
                            children: m[c].description,
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 765,
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
                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                      lineNumber: 763,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "relative",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: `aspect-video w-full bg-gradient-to-br ${m[c].gradient} overflow-hidden flex flex-col items-center justify-center text-white`,
                            children: [
                              (() => {
                                const n = m[c].icon;
                                return e.jsxDEV(
                                  n,
                                  { className: "h-24 w-24 mb-4 opacity-90" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Landing.tsx",
                                    lineNumber: 771,
                                    columnNumber: 24,
                                  },
                                  this,
                                );
                              })(),
                              e.jsxDEV(
                                "h3",
                                {
                                  className: "text-2xl font-bold mb-2",
                                  children: m[c].title,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 773,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "p",
                                {
                                  className:
                                    "text-lg opacity-90 max-w-md text-center px-4",
                                  children: m[c].description,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 774,
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
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 768,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          l,
                          {
                            variant: "ghost",
                            size: "icon",
                            className:
                              "absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full h-10 w-10",
                            onClick: f,
                            children: e.jsxDEV(
                              O,
                              { className: "h-6 w-6" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                lineNumber: 782,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 776,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          l,
                          {
                            variant: "ghost",
                            size: "icon",
                            className:
                              "absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full h-10 w-10",
                            onClick: b,
                            children: e.jsxDEV(
                              Y,
                              { className: "h-6 w-6" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                lineNumber: 790,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 784,
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
                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                      lineNumber: 767,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "flex justify-center gap-2 p-4",
                      children: m.map((n, a) =>
                        e.jsxDEV(
                          "button",
                          {
                            className: `transition-all duration-300 rounded-full ${a === c ? "w-6 h-2 bg-amber-400" : "w-2 h-2 bg-white/20 hover:bg-white/40"}`,
                            onClick: () => N(a),
                          },
                          a,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 795,
                            columnNumber: 15,
                          },
                          this,
                        ),
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                      lineNumber: 793,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
                lineNumber: 762,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
            lineNumber: 761,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          "footer",
          {
            className: "landing-footer",
            children: e.jsxDEV(
              "div",
              {
                className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12",
                children: [
                  e.jsxDEV(
                    "div",
                    {
                      className: "grid grid-cols-1 md:grid-cols-4 gap-8 mb-8",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "md:col-span-1",
                            children: [
                              e.jsxDEV(
                                S,
                                { size: "md", className: "mb-4" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 810,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "p",
                                {
                                  className:
                                    "text-white/40 text-sm leading-relaxed",
                                  children:
                                    "The most advanced AI-powered music career management platform.",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 811,
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
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 809,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            children: [
                              e.jsxDEV(
                                "h4",
                                {
                                  className:
                                    "text-white/70 font-semibold text-sm uppercase tracking-wider mb-4",
                                  children: "Product",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 816,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "ul",
                                {
                                  className: "space-y-2",
                                  children: [
                                    { label: "Features", href: "/features" },
                                    { label: "Pricing", href: "/pricing" },
                                    {
                                      label: "Documentation",
                                      href: "/documentation",
                                    },
                                  ].map((n) =>
                                    e.jsxDEV(
                                      "li",
                                      {
                                        children: e.jsxDEV(
                                          t,
                                          {
                                            href: n.href,
                                            children: e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "text-white/40 hover:text-white text-sm transition-colors cursor-pointer",
                                                children: n.label,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                lineNumber: 825,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                                            lineNumber: 824,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      n.href,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                                        lineNumber: 823,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 817,
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
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 815,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            children: [
                              e.jsxDEV(
                                "h4",
                                {
                                  className:
                                    "text-white/70 font-semibold text-sm uppercase tracking-wider mb-4",
                                  children: "Company",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 832,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "ul",
                                {
                                  className: "space-y-2",
                                  children: [
                                    { label: "About", href: "/about" },
                                    { label: "Blog", href: "/blog" },
                                    { label: "API", href: "/api" },
                                  ].map((n) =>
                                    e.jsxDEV(
                                      "li",
                                      {
                                        children: e.jsxDEV(
                                          t,
                                          {
                                            href: n.href,
                                            children: e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "text-white/40 hover:text-white text-sm transition-colors cursor-pointer",
                                                children: n.label,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                lineNumber: 841,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                                            lineNumber: 840,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      n.href,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                                        lineNumber: 839,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 833,
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
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 831,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            children: [
                              e.jsxDEV(
                                "h4",
                                {
                                  className:
                                    "text-white/70 font-semibold text-sm uppercase tracking-wider mb-4",
                                  children: "Legal",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 848,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "ul",
                                {
                                  className: "space-y-2",
                                  children: [
                                    {
                                      label: "Privacy Policy",
                                      href: "/privacy",
                                    },
                                    {
                                      label: "Terms of Service",
                                      href: "/terms",
                                    },
                                    { label: "DMCA", href: "/dmca" },
                                  ].map((n) =>
                                    e.jsxDEV(
                                      "li",
                                      {
                                        children: e.jsxDEV(
                                          t,
                                          {
                                            href: n.href,
                                            children: e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "text-white/40 hover:text-white text-sm transition-colors cursor-pointer",
                                                children: n.label,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Landing.tsx",
                                                lineNumber: 857,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                                            lineNumber: 856,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      n.href,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Landing.tsx",
                                        lineNumber: 855,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 849,
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
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 847,
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
                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                      lineNumber: 808,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className:
                        "border-t border-white/5 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4",
                      children: [
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-white/30 text-sm",
                            children: [
                              "© ",
                              new Date().getFullYear(),
                              " Max Booster by B-Lawz Music. All rights reserved.",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 865,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className:
                              "flex items-center gap-2 text-white/30 text-sm",
                            children: [
                              e.jsxDEV(
                                W,
                                { className: "h-3.5 w-3.5 text-emerald-400" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Landing.tsx",
                                  lineNumber: 869,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              "All systems operational",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Landing.tsx",
                            lineNumber: 868,
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
                        "/home/runner/workspace/client/src/pages/Landing.tsx",
                      lineNumber: 864,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
                lineNumber: 807,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
            lineNumber: 806,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    !0,
    {
      fileName: "/home/runner/workspace/client/src/pages/Landing.tsx",
      lineNumber: 375,
      columnNumber: 5,
    },
    this,
  );
}
export { pe as default };
