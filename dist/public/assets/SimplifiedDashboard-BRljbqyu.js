import {
  ag as w,
  r as k,
  f as e,
  c2 as S,
  aY as p,
  aR as j,
  bb as E,
  b$ as V,
  bf as y,
  bv as C,
  al as A,
  aO as P,
  cT as M,
  b2 as T,
} from "./vendor-react-31oK5L0i.js";
import {
  B as d,
  j as l,
  C as r,
  d as s,
  f as a,
  h as o,
  P as Y,
} from "./studio-DOUfHW5v.js";
function z({ onUpgrade: N, userLevel: u }) {
  const [, f] = w(),
    [m, x] = k.useState([]),
    D = [
      {
        id: "upload-music",
        title: "Upload Your Music",
        description: "Get your music on all major platforms",
        icon: e.jsxDEV(
          A,
          { className: "w-6 h-6" },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
            lineNumber: 37,
            columnNumber: 13,
          },
          this,
        ),
        color: "bg-blue-500",
        href: "/distribution",
      },
      {
        id: "create-beat",
        title: "Create a Beat",
        description: "Use our AI-powered studio",
        icon: e.jsxDEV(
          P,
          { className: "w-6 h-6" },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
            lineNumber: 45,
            columnNumber: 13,
          },
          this,
        ),
        color: "bg-purple-500",
        href: "/studio",
      },
      {
        id: "share-music",
        title: "Share on Social",
        description: "AI-optimized social media posts",
        icon: e.jsxDEV(
          M,
          { className: "w-6 h-6" },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
            lineNumber: 53,
            columnNumber: 13,
          },
          this,
        ),
        color: "bg-pink-500",
        href: "/social-media",
      },
      {
        id: "boost-reach",
        title: "Boost Your Reach",
        description: "Zero-cost AI advertising",
        icon: e.jsxDEV(
          T,
          { className: "w-6 h-6" },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
            lineNumber: 61,
            columnNumber: 13,
          },
          this,
        ),
        color: "bg-red-500",
        href: "/advertising",
      },
    ],
    t = [
      {
        id: "setup-profile",
        title: "Complete Your Profile",
        description: "Add your artist information and bio",
        completed: m.includes("setup-profile"),
        points: 10,
      },
      {
        id: "upload-first-track",
        title: "Upload Your First Track",
        description: "Get your music on streaming platforms",
        completed: m.includes("upload-first-track"),
        points: 25,
      },
      {
        id: "connect-social",
        title: "Connect Social Media",
        description: "Link your social media accounts",
        completed: m.includes("connect-social"),
        points: 15,
      },
      {
        id: "create-first-post",
        title: "Create Your First Post",
        description: "Share your music with AI-optimized content",
        completed: m.includes("create-first-post"),
        points: 20,
      },
    ],
    b = t.reduce((i, n) => i + n.points, 0),
    h = t.filter((i) => i.completed).reduce((i, n) => i + n.points, 0),
    c = (h / b) * 100,
    g = (i) => {
      x((n) => [...n, i]);
    },
    v = (i) => {
      switch (i) {
        case "beginner":
          return "bg-green-100 text-green-800";
        case "intermediate":
          return "bg-yellow-100 text-yellow-800";
        case "advanced":
          return "bg-red-100 text-red-800";
        default:
          return "bg-gray-100 text-gray-800";
      }
    };
  return e.jsxDEV(
    "div",
    {
      className:
        "min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6",
      children: e.jsxDEV(
        "div",
        {
          className: "max-w-7xl mx-auto space-y-6",
          children: [
            e.jsxDEV(
              "div",
              {
                className: "flex items-center justify-between",
                children: [
                  e.jsxDEV(
                    "div",
                    {
                      children: [
                        e.jsxDEV(
                          "h1",
                          {
                            className: "text-3xl font-bold text-gray-900",
                            children: "Welcome to Max Booster",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                            lineNumber: 127,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-gray-600 mt-2",
                            children:
                              "Your simplified music career management dashboard",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                            lineNumber: 128,
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
                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                      lineNumber: 126,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "flex items-center space-x-4",
                      children: [
                        e.jsxDEV(
                          d,
                          { className: v(u), children: [u, " Mode"] },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                            lineNumber: 131,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          l,
                          {
                            onClick: N,
                            variant: "outline",
                            children: [
                              e.jsxDEV(
                                S,
                                { className: "w-4 h-4 mr-2" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                  lineNumber: 133,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              "Upgrade to Full Mode",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                            lineNumber: 132,
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
                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                      lineNumber: 130,
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
                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                lineNumber: 125,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              r,
              {
                children: [
                  e.jsxDEV(
                    s,
                    {
                      children: e.jsxDEV(
                        a,
                        {
                          className: "flex items-center space-x-2",
                          children: [
                            e.jsxDEV(
                              p,
                              { className: "w-5 h-5 text-blue-500" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 143,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "span",
                              { children: "Your Progress" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 144,
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
                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                          lineNumber: 142,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                      lineNumber: 141,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    o,
                    {
                      children: e.jsxDEV(
                        "div",
                        {
                          className: "space-y-4",
                          children: [
                            e.jsxDEV(
                              "div",
                              {
                                className: "flex items-center justify-between",
                                children: [
                                  e.jsxDEV(
                                    "span",
                                    {
                                      className: "text-sm font-medium",
                                      children: "Getting Started",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 150,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "span",
                                    {
                                      className: "text-sm text-gray-600",
                                      children: [h, "/", b, " points"],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 151,
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
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 149,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              Y,
                              { value: c, className: "h-3" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 155,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "flex items-center space-x-2",
                                children: [
                                  e.jsxDEV(
                                    j,
                                    { className: "w-4 h-4 text-yellow-500" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 157,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "span",
                                    {
                                      className: "text-sm text-gray-600",
                                      children:
                                        c >= 100
                                          ? "🎉 All tasks completed!"
                                          : `${Math.round(100 - c)}% to completion`,
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 158,
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
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 156,
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
                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                          lineNumber: 148,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                      lineNumber: 147,
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
                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                lineNumber: 140,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                className: "grid grid-cols-1 lg:grid-cols-3 gap-6",
                children: [
                  e.jsxDEV(
                    "div",
                    {
                      className: "lg:col-span-2",
                      children: e.jsxDEV(
                        r,
                        {
                          children: [
                            e.jsxDEV(
                              s,
                              {
                                children: [
                                  e.jsxDEV(
                                    a,
                                    { children: "Quick Actions" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 173,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className: "text-gray-600",
                                      children:
                                        "Start with these essential tasks",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 174,
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
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 172,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              o,
                              {
                                children: e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "grid grid-cols-1 md:grid-cols-2 gap-4",
                                    children: D.map((i) =>
                                      e.jsxDEV(
                                        r,
                                        {
                                          className:
                                            "hover:shadow-md transition-shadow cursor-pointer",
                                          children: e.jsxDEV(
                                            o,
                                            {
                                              className: "p-4",
                                              children: e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "flex items-start space-x-3",
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: `p-2 rounded-lg ${i.color} text-white`,
                                                        children: i.icon,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                        lineNumber: 185,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: "flex-1",
                                                        children: [
                                                          e.jsxDEV(
                                                            "h3",
                                                            {
                                                              className:
                                                                "font-semibold",
                                                              children: i.title,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                              lineNumber: 189,
                                                              columnNumber: 29,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "p",
                                                            {
                                                              className:
                                                                "text-sm text-gray-600 mt-1",
                                                              children:
                                                                i.description,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                              lineNumber: 190,
                                                              columnNumber: 29,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            l,
                                                            {
                                                              size: "sm",
                                                              className: "mt-3",
                                                              variant:
                                                                "outline",
                                                              onClick: () =>
                                                                f(i.href),
                                                              children: [
                                                                "Get Started",
                                                                e.jsxDEV(
                                                                  E,
                                                                  {
                                                                    className:
                                                                      "w-3 h-3 ml-1",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                                    lineNumber: 198,
                                                                    columnNumber: 31,
                                                                  },
                                                                  this,
                                                                ),
                                                              ],
                                                            },
                                                            void 0,
                                                            !0,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                              lineNumber: 191,
                                                              columnNumber: 29,
                                                            },
                                                            this,
                                                          ),
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                        lineNumber: 188,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                  lineNumber: 184,
                                                  columnNumber: 25,
                                                },
                                                this,
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                              lineNumber: 183,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                        },
                                        i.id,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                          lineNumber: 179,
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
                                      "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                    lineNumber: 177,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 176,
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
                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                          lineNumber: 171,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                      lineNumber: 170,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      children: e.jsxDEV(
                        r,
                        {
                          children: [
                            e.jsxDEV(
                              s,
                              {
                                children: [
                                  e.jsxDEV(
                                    a,
                                    { children: "Getting Started" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 214,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className: "text-gray-600",
                                      children:
                                        "Complete these tasks to unlock features",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 215,
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
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 213,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              o,
                              {
                                children: e.jsxDEV(
                                  "div",
                                  {
                                    className: "space-y-3",
                                    children: t.map((i) =>
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: `p-3 rounded-lg border-2 transition-colors ${i.completed ? "border-green-200 bg-green-50" : "border-gray-200 bg-white hover:border-blue-200"}`,
                                          children: e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "flex items-start space-x-3",
                                              children: [
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "mt-1",
                                                    children: i.completed
                                                      ? e.jsxDEV(
                                                          V,
                                                          {
                                                            className:
                                                              "w-5 h-5 text-green-500",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                            lineNumber: 231,
                                                            columnNumber: 29,
                                                          },
                                                          this,
                                                        )
                                                      : e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "w-5 h-5 border-2 border-gray-300 rounded-full",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                            lineNumber: 233,
                                                            columnNumber: 29,
                                                          },
                                                          this,
                                                        ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                    lineNumber: 229,
                                                    columnNumber: 25,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "flex-1",
                                                    children: [
                                                      e.jsxDEV(
                                                        "h4",
                                                        {
                                                          className:
                                                            "font-medium text-sm",
                                                          children: i.title,
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                          lineNumber: 237,
                                                          columnNumber: 27,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        "p",
                                                        {
                                                          className:
                                                            "text-xs text-gray-600 mt-1",
                                                          children:
                                                            i.description,
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                          lineNumber: 238,
                                                          columnNumber: 27,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "flex items-center justify-between mt-2",
                                                          children: [
                                                            e.jsxDEV(
                                                              d,
                                                              {
                                                                variant:
                                                                  "secondary",
                                                                className:
                                                                  "text-xs",
                                                                children: [
                                                                  "+",
                                                                  i.points,
                                                                  " pts",
                                                                ],
                                                              },
                                                              void 0,
                                                              !0,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                                lineNumber: 240,
                                                                columnNumber: 29,
                                                              },
                                                              this,
                                                            ),
                                                            !i.completed &&
                                                              e.jsxDEV(
                                                                l,
                                                                {
                                                                  size: "sm",
                                                                  variant:
                                                                    "ghost",
                                                                  onClick: () =>
                                                                    g(i.id),
                                                                  className:
                                                                    "text-xs",
                                                                  children:
                                                                    "Mark Complete",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                                  lineNumber: 244,
                                                                  columnNumber: 31,
                                                                },
                                                                this,
                                                              ),
                                                          ],
                                                        },
                                                        void 0,
                                                        !0,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                          lineNumber: 239,
                                                          columnNumber: 27,
                                                        },
                                                        this,
                                                      ),
                                                    ],
                                                  },
                                                  void 0,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                                    lineNumber: 236,
                                                    columnNumber: 25,
                                                  },
                                                  this,
                                                ),
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                              lineNumber: 228,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                        },
                                        i.id,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                          lineNumber: 220,
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
                                      "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                    lineNumber: 218,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 217,
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
                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                          lineNumber: 212,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                      lineNumber: 211,
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
                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                lineNumber: 168,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              r,
              {
                children: [
                  e.jsxDEV(
                    s,
                    {
                      children: e.jsxDEV(
                        a,
                        { children: "Recent Activity" },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                          lineNumber: 267,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                      lineNumber: 266,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    o,
                    {
                      children: e.jsxDEV(
                        "div",
                        {
                          className: "space-y-3",
                          children: [
                            e.jsxDEV(
                              "div",
                              {
                                className:
                                  "flex items-center space-x-3 p-3 bg-blue-50 rounded-lg",
                                children: [
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className:
                                        "p-2 bg-blue-500 rounded-lg text-white",
                                      children: e.jsxDEV(
                                        y,
                                        { className: "w-4 h-4" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                          lineNumber: 273,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 272,
                                      columnNumber: 17,
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
                                            className: "font-medium text-sm",
                                            children: "Welcome to Max Booster!",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                            lineNumber: 276,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "p",
                                          {
                                            className: "text-xs text-gray-600",
                                            children:
                                              "Your account has been created successfully",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                            lineNumber: 277,
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
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 275,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    d,
                                    {
                                      variant: "secondary",
                                      className: "ml-auto",
                                      children: "Just now",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 281,
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
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 271,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className:
                                  "flex items-center space-x-3 p-3 bg-gray-50 rounded-lg",
                                children: [
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className:
                                        "p-2 bg-gray-400 rounded-lg text-white",
                                      children: e.jsxDEV(
                                        C,
                                        { className: "w-4 h-4" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                          lineNumber: 288,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 287,
                                      columnNumber: 17,
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
                                            className: "font-medium text-sm",
                                            children: "Complete your profile",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                            lineNumber: 291,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "p",
                                          {
                                            className: "text-xs text-gray-600",
                                            children:
                                              "Add your artist information to get started",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                            lineNumber: 292,
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
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 290,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    l,
                                    {
                                      size: "sm",
                                      variant: "outline",
                                      children: "Complete",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 296,
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
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 286,
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
                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                          lineNumber: 270,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                      lineNumber: 269,
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
                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                lineNumber: 265,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              r,
              {
                children: [
                  e.jsxDEV(
                    s,
                    {
                      children: e.jsxDEV(
                        a,
                        {
                          className: "flex items-center space-x-2",
                          children: [
                            e.jsxDEV(
                              p,
                              { className: "w-5 h-5 text-yellow-500" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 308,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "span",
                              { children: "Pro Tips" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 309,
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
                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                          lineNumber: 307,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                      lineNumber: 306,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    o,
                    {
                      children: e.jsxDEV(
                        "div",
                        {
                          className: "grid grid-cols-1 md:grid-cols-3 gap-4",
                          children: [
                            e.jsxDEV(
                              "div",
                              {
                                className:
                                  "p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg",
                                children: [
                                  e.jsxDEV(
                                    "h4",
                                    {
                                      className: "font-semibold text-sm mb-2",
                                      children: "🎵 Start with Distribution",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 315,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className: "text-xs text-gray-600",
                                      children:
                                        "Upload your music first to get it on all major platforms",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 316,
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
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 314,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className:
                                  "p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg",
                                children: [
                                  e.jsxDEV(
                                    "h4",
                                    {
                                      className: "font-semibold text-sm mb-2",
                                      children: "🤖 Use AI Features",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 321,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className: "text-xs text-gray-600",
                                      children:
                                        "Let AI optimize your social media posts and advertising",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 322,
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
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 320,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className:
                                  "p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg",
                                children: [
                                  e.jsxDEV(
                                    "h4",
                                    {
                                      className: "font-semibold text-sm mb-2",
                                      children: "📈 Track Your Progress",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 327,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className: "text-xs text-gray-600",
                                      children:
                                        "Monitor your analytics to see what's working",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                      lineNumber: 328,
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
                                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                                lineNumber: 326,
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
                            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                          lineNumber: 313,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                      lineNumber: 312,
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
                  "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
                lineNumber: 305,
                columnNumber: 9,
              },
              this,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName:
            "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
          lineNumber: 123,
          columnNumber: 7,
        },
        this,
      ),
    },
    void 0,
    !1,
    {
      fileName:
        "/home/runner/workspace/client/src/components/onboarding/SimplifiedDashboard.tsx",
      lineNumber: 122,
      columnNumber: 5,
    },
    this,
  );
}
export { z as S };
