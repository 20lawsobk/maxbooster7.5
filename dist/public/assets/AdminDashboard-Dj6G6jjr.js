import {
  r as b,
  aH as S,
  f as e,
  ap as ye,
  aL as se,
  cv as q,
  fs as re,
  dm as Te,
  dc as O,
  aQ as W,
  cZ as Se,
  bB as Ce,
  cw as Le,
  eS as ae,
  b7 as Ie,
  b9 as Re,
  a_ as ie,
  b$ as $,
  bw as Q,
  cL as ne,
  aR as z,
  cc as te,
  bK as G,
  b2 as Ue,
  cK as qe,
  aM as $e,
  dZ as Pe,
  eB as Fe,
  ft as Me,
  cu as Oe,
  aK as ce,
  ao as Ke,
  aI as J,
  dh as Be,
  bu as He,
  fu as We,
  bQ as Qe,
  aX as ze,
} from "./vendor-react-31oK5L0i.js";
import {
  j,
  a8 as d,
  C as n,
  h as m,
  a4 as Ge,
  a5 as Je,
  a6 as k,
  a9 as A,
  d as l,
  f as o,
  P as T,
  B as w,
  I as Xe,
  o as Ze,
  p as Ye,
  r as _e,
  v as es,
  w as ss,
  u as ue,
  k as X,
} from "./studio-DOUfHW5v.js";
import { b as rs } from "./useRequireAuth-K5x5riUd.js";
import { A as as } from "./AppLayout-D2pri0rw.js";
import { A as me, f as le } from "./index-D5xLbTBZ.js";
import {
  T as is,
  a as ns,
  b as oe,
  c as L,
  d as ms,
  e as I,
} from "./table-BLAeU9Q6.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
import "./TopBar-jcH3P98k.js";
function vs() {
  const { user: x, isLoading: E } = rs(),
    [C, f] = b.useState("overview"),
    [v, V] = b.useState(!1),
    [h, t] = b.useState(1),
    [p, r] = b.useState(""),
    [D, P] = b.useState(""),
    [N, de] = b.useState(null),
    [he, Z] = b.useState(!1);
  b.useEffect(() => {
    const s = setTimeout(() => {
      (P(p), t(1));
    }, 300);
    return () => clearTimeout(s);
  }, [p]);
  const R = !!x && x.role === "admin",
    {
      data: Ne,
      isLoading: U,
      refetch: be,
    } = S({
      queryKey: ["/api/audit/results"],
      enabled: R,
      refetchInterval: 3e4,
    }),
    {
      data: pe,
      isLoading: K,
      refetch: xe,
    } = S({
      queryKey: ["/api/testing/results"],
      enabled: R,
      refetchInterval: 6e4,
    }),
    {
      data: fe,
      isLoading: F,
      refetch: De,
    } = S({
      queryKey: ["/api/admin/metrics"],
      enabled: R,
      refetchInterval: 3e4,
    }),
    {
      data: ge,
      isLoading: ve,
      refetch: we,
    } = S({ queryKey: ["/api/admin/analytics"], enabled: R }),
    {
      data: Y = [],
      isLoading: ke,
      refetch: Ae,
    } = S({ queryKey: ["/api/admin/activity"], enabled: R }),
    {
      data: g,
      isLoading: B,
      error: je,
      refetch: Ee,
    } = S({
      queryKey: ["/api/admin/users", h, D],
      enabled: R,
      queryFn: async () => {
        const s = new URLSearchParams({ page: h.toString(), limit: "20" });
        D && s.append("search", D);
        const i = await fetch(`/api/admin/users?${s}`, {
          credentials: "include",
        });
        if (!i.ok) throw new Error("Failed to fetch users");
        return i.json();
      },
    }),
    Ve = async () => {
      V(!0);
      try {
        await Promise.all([be(), xe(), De(), we(), Ae()]);
      } finally {
        V(!1);
      }
    };
  if (E)
    return e.jsxDEV(
      "div",
      {
        className: "min-h-screen flex items-center justify-center",
        children: e.jsxDEV(
          "div",
          {
            className: "flex flex-col items-center gap-4",
            children: [
              e.jsxDEV(
                ye,
                { className: "w-8 h-8 animate-spin text-primary" },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                  lineNumber: 194,
                  columnNumber: 11,
                },
                this,
              ),
              e.jsxDEV(
                "p",
                {
                  className: "text-muted-foreground",
                  children: "Loading admin dashboard…",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                  lineNumber: 195,
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
              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
            lineNumber: 193,
            columnNumber: 9,
          },
          this,
        ),
      },
      void 0,
      !1,
      {
        fileName: "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
        lineNumber: 192,
        columnNumber: 7,
      },
      this,
    );
  if (!x || x.role !== "admin") return null;
  const a = Ne,
    c = pe,
    u = fe,
    y = ge,
    M = (s) =>
      s >= 95
        ? { status: "excellent", color: "text-green-600", bg: "bg-green-100" }
        : s >= 85
          ? { status: "good", color: "text-blue-600", bg: "bg-blue-100" }
          : s >= 70
            ? { status: "fair", color: "text-yellow-600", bg: "bg-yellow-100" }
            : { status: "poor", color: "text-red-600", bg: "bg-red-100" },
    _ = a ? M(a.overallScore) : { color: "text-gray-600", bg: "bg-gray-100" },
    ee = c ? M(c.overallScore) : { color: "text-gray-600", bg: "bg-gray-100" };
  return e.jsxDEV(
    as,
    {
      title: "Admin Dashboard",
      subtitle: "System monitoring and management",
      children: e.jsxDEV(
        "div",
        {
          className: "space-y-6",
          children: [
            e.jsxDEV(
              "div",
              {
                className: "flex justify-between items-center",
                children: [
                  e.jsxDEV(
                    "div",
                    {
                      children: [
                        e.jsxDEV(
                          "h1",
                          {
                            className: "text-2xl font-bold text-gray-900",
                            children: "System Overview",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 234,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-gray-600",
                            children:
                              "Monitor system health, security, and performance",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 235,
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
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 233,
                      columnNumber: 13,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    j,
                    {
                      onClick: Ve,
                      disabled: v,
                      className: "flex items-center space-x-2",
                      "data-testid": "button-refresh-dashboard",
                      children: [
                        e.jsxDEV(
                          se,
                          { className: `h-4 w-4 ${v ? "animate-spin" : ""}` },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 243,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "span",
                          { children: "Refresh" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 244,
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
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 237,
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
                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                lineNumber: 232,
                columnNumber: 11,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                className:
                  "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6",
                children: [
                  U || !a
                    ? e.jsxDEV(
                        d,
                        {
                          className: "h-32 w-full",
                          "data-testid": "card-audit-score",
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 251,
                          columnNumber: 15,
                        },
                        this,
                      )
                    : e.jsxDEV(
                        n,
                        {
                          className:
                            "bg-gradient-to-br from-green-50 to-emerald-100 border-green-200",
                          "data-testid": "card-audit-score",
                          children: e.jsxDEV(
                            m,
                            {
                              className: "p-6",
                              children: e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "flex items-center justify-between",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-sm font-medium text-green-700",
                                              children: "Audit Score",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 260,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-3xl font-bold text-green-900",
                                              children: [
                                                a.overallScore,
                                                "/100",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 261,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-xs text-green-600 mt-1",
                                              children: "Security & Compliance",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 264,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 259,
                                        columnNumber: 21,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: `p-3 rounded-full ${_.bg}`,
                                        children: e.jsxDEV(
                                          q,
                                          { className: `w-6 h-6 ${_.color}` },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 267,
                                            columnNumber: 23,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 266,
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
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 258,
                                  columnNumber: 19,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                              lineNumber: 257,
                              columnNumber: 17,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 253,
                          columnNumber: 15,
                        },
                        this,
                      ),
                  K || !c
                    ? e.jsxDEV(
                        d,
                        {
                          className: "h-32 w-full",
                          "data-testid": "card-test-score",
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 275,
                          columnNumber: 15,
                        },
                        this,
                      )
                    : e.jsxDEV(
                        n,
                        {
                          className:
                            "bg-gradient-to-br from-blue-50 to-cyan-100 border-blue-200",
                          "data-testid": "card-test-score",
                          children: e.jsxDEV(
                            m,
                            {
                              className: "p-6",
                              children: e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "flex items-center justify-between",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-sm font-medium text-blue-700",
                                              children: "Test Score",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 284,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-3xl font-bold text-blue-900",
                                              children: [
                                                c.overallScore,
                                                "/100",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 285,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-xs text-blue-600 mt-1",
                                              children: "Quality Assurance",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 288,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 283,
                                        columnNumber: 21,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: `p-3 rounded-full ${ee.bg}`,
                                        children: e.jsxDEV(
                                          re,
                                          { className: `w-6 h-6 ${ee.color}` },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 291,
                                            columnNumber: 23,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 290,
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
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 282,
                                  columnNumber: 19,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                              lineNumber: 281,
                              columnNumber: 17,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 277,
                          columnNumber: 15,
                        },
                        this,
                      ),
                  F || !u
                    ? e.jsxDEV(
                        d,
                        {
                          className: "h-32 w-full",
                          "data-testid": "card-system-uptime",
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 299,
                          columnNumber: 15,
                        },
                        this,
                      )
                    : e.jsxDEV(
                        n,
                        {
                          className:
                            "bg-gradient-to-br from-purple-50 to-violet-100 border-purple-200",
                          "data-testid": "card-system-uptime",
                          children: e.jsxDEV(
                            m,
                            {
                              className: "p-6",
                              children: e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "flex items-center justify-between",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-sm font-medium text-purple-700",
                                              children: "System Uptime",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 308,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-3xl font-bold text-purple-900",
                                              children: [u.uptime, "%"],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 309,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-xs text-purple-600 mt-1",
                                              children: "Availability",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 310,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 307,
                                        columnNumber: 21,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "p-3 bg-purple-200 rounded-full",
                                        children: e.jsxDEV(
                                          Te,
                                          {
                                            className:
                                              "w-6 h-6 text-purple-700",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 313,
                                            columnNumber: 23,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 312,
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
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 306,
                                  columnNumber: 19,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                              lineNumber: 305,
                              columnNumber: 17,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 301,
                          columnNumber: 15,
                        },
                        this,
                      ),
                  F || !u
                    ? e.jsxDEV(
                        d,
                        {
                          className: "h-32 w-full",
                          "data-testid": "card-active-users",
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 321,
                          columnNumber: 15,
                        },
                        this,
                      )
                    : e.jsxDEV(
                        n,
                        {
                          className:
                            "bg-gradient-to-br from-orange-50 to-amber-100 border-orange-200",
                          "data-testid": "card-active-users",
                          children: e.jsxDEV(
                            m,
                            {
                              className: "p-6",
                              children: e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "flex items-center justify-between",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-sm font-medium text-orange-700",
                                              children: "Active Users",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 330,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-3xl font-bold text-orange-900",
                                              children:
                                                u.activeUsers.toLocaleString(),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 331,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-xs text-orange-600 mt-1",
                                              children: "Currently Online",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 334,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 329,
                                        columnNumber: 21,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "p-3 bg-orange-200 rounded-full",
                                        children: e.jsxDEV(
                                          O,
                                          {
                                            className:
                                              "w-6 h-6 text-orange-700",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 337,
                                            columnNumber: 23,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 336,
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
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 328,
                                  columnNumber: 19,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                              lineNumber: 327,
                              columnNumber: 17,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 323,
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
                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                lineNumber: 249,
                columnNumber: 11,
              },
              this,
            ),
            e.jsxDEV(
              Ge,
              {
                value: C,
                onValueChange: f,
                className: "space-y-6",
                children: [
                  e.jsxDEV(
                    Je,
                    {
                      className: "grid w-full grid-cols-9",
                      children: [
                        e.jsxDEV(
                          k,
                          {
                            value: "overview",
                            "data-testid": "tab-overview",
                            children: "Overview",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 348,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          k,
                          {
                            value: "audit",
                            "data-testid": "tab-audit",
                            children: "Audit",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 351,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          k,
                          {
                            value: "testing",
                            "data-testid": "tab-testing",
                            children: "Testing",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 354,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          k,
                          {
                            value: "performance",
                            "data-testid": "tab-performance",
                            children: "Performance",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 357,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          k,
                          {
                            value: "users",
                            "data-testid": "tab-users",
                            children: "Users",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 360,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          k,
                          {
                            value: "compliance",
                            "data-testid": "tab-compliance",
                            children: "Compliance",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 363,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          k,
                          {
                            value: "tokens",
                            "data-testid": "tab-tokens",
                            children: "Tokens",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 366,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          k,
                          {
                            value: "webhooks",
                            "data-testid": "tab-webhooks",
                            children: "Webhooks",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 369,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          k,
                          {
                            value: "logs",
                            "data-testid": "tab-logs",
                            children: "Logs",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 372,
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
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 347,
                      columnNumber: 13,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    A,
                    {
                      value: "overview",
                      className: "space-y-6",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "grid grid-cols-1 lg:grid-cols-2 gap-6",
                            children: [
                              e.jsxDEV(
                                n,
                                {
                                  children: [
                                    e.jsxDEV(
                                      l,
                                      {
                                        children: e.jsxDEV(
                                          o,
                                          {
                                            className: "flex items-center",
                                            children: [
                                              e.jsxDEV(
                                                W,
                                                { className: "h-5 w-5 mr-2" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 384,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              "System Metrics",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 383,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 382,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      m,
                                      {
                                        children:
                                          F || !u
                                            ? e.jsxDEV(
                                                d,
                                                { className: "h-64 w-full" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 390,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              )
                                            : e.jsxDEV(
                                                "div",
                                                {
                                                  className: "space-y-4",
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center justify-between",
                                                        children: [
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "flex items-center space-x-3",
                                                              children: [
                                                                e.jsxDEV(
                                                                  Se,
                                                                  {
                                                                    className:
                                                                      "h-5 w-5 text-blue-600",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 395,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  "span",
                                                                  {
                                                                    className:
                                                                      "text-sm font-medium",
                                                                    children:
                                                                      "CPU Usage",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 396,
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
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 394,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "span",
                                                            {
                                                              className:
                                                                "text-sm font-bold",
                                                              children: [
                                                                u.cpu,
                                                                "%",
                                                              ],
                                                            },
                                                            void 0,
                                                            !0,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 398,
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
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 393,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      T,
                                                      {
                                                        value: u.cpu,
                                                        className: "h-2",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 400,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center justify-between",
                                                        children: [
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "flex items-center space-x-3",
                                                              children: [
                                                                e.jsxDEV(
                                                                  Ce,
                                                                  {
                                                                    className:
                                                                      "h-5 w-5 text-green-600",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 404,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  "span",
                                                                  {
                                                                    className:
                                                                      "text-sm font-medium",
                                                                    children:
                                                                      "Memory Usage",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 405,
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
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 403,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "span",
                                                            {
                                                              className:
                                                                "text-sm font-bold",
                                                              children: [
                                                                u.memory,
                                                                "%",
                                                              ],
                                                            },
                                                            void 0,
                                                            !0,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 407,
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
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 402,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      T,
                                                      {
                                                        value: u.memory,
                                                        className: "h-2",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 409,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center justify-between",
                                                        children: [
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "flex items-center space-x-3",
                                                              children: [
                                                                e.jsxDEV(
                                                                  Le,
                                                                  {
                                                                    className:
                                                                      "h-5 w-5 text-purple-600",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 413,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  "span",
                                                                  {
                                                                    className:
                                                                      "text-sm font-medium",
                                                                    children:
                                                                      "Disk Usage",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 414,
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
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 412,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "span",
                                                            {
                                                              className:
                                                                "text-sm font-bold",
                                                              children: [
                                                                u.disk,
                                                                "%",
                                                              ],
                                                            },
                                                            void 0,
                                                            !0,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 416,
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
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 411,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      T,
                                                      {
                                                        value: u.disk,
                                                        className: "h-2",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 418,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center justify-between",
                                                        children: [
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "flex items-center space-x-3",
                                                              children: [
                                                                e.jsxDEV(
                                                                  ae,
                                                                  {
                                                                    className:
                                                                      "h-5 w-5 text-orange-600",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 422,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  "span",
                                                                  {
                                                                    className:
                                                                      "text-sm font-medium",
                                                                    children:
                                                                      "Network I/O",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 423,
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
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 421,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "span",
                                                            {
                                                              className:
                                                                "text-sm font-bold",
                                                              children: [
                                                                u.network,
                                                                "%",
                                                              ],
                                                            },
                                                            void 0,
                                                            !0,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 425,
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
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 420,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      T,
                                                      {
                                                        value: u.network,
                                                        className: "h-2",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 427,
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
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 392,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 388,
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
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 381,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                n,
                                {
                                  children: [
                                    e.jsxDEV(
                                      l,
                                      {
                                        children: e.jsxDEV(
                                          o,
                                          {
                                            className: "flex items-center",
                                            children: [
                                              e.jsxDEV(
                                                Ie,
                                                { className: "h-5 w-5 mr-2" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 437,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              "User Analytics",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 436,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 435,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      m,
                                      {
                                        children:
                                          ve || !y
                                            ? e.jsxDEV(
                                                d,
                                                { className: "h-64 w-full" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 443,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              )
                                            : e.jsxDEV(
                                                "div",
                                                {
                                                  className: "space-y-4",
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "grid grid-cols-2 gap-4",
                                                        children: [
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "text-center p-4 bg-blue-50 rounded-lg",
                                                              children: [
                                                                e.jsxDEV(
                                                                  "p",
                                                                  {
                                                                    className:
                                                                      "text-2xl font-bold text-blue-600",
                                                                    children:
                                                                      y.newUsers,
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 448,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  "p",
                                                                  {
                                                                    className:
                                                                      "text-sm text-blue-600",
                                                                    children:
                                                                      "New Users Today",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 451,
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
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 447,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "text-center p-4 bg-green-50 rounded-lg",
                                                              children: [
                                                                e.jsxDEV(
                                                                  "p",
                                                                  {
                                                                    className:
                                                                      "text-2xl font-bold text-green-600",
                                                                    children:
                                                                      y.totalRevenue.toLocaleString(),
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 454,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  "p",
                                                                  {
                                                                    className:
                                                                      "text-sm text-green-600",
                                                                    children:
                                                                      "Total Revenue",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 457,
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
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 453,
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
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 446,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: "space-y-2",
                                                        children: [
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "flex items-center justify-between",
                                                              children: [
                                                                e.jsxDEV(
                                                                  "span",
                                                                  {
                                                                    className:
                                                                      "text-sm font-medium",
                                                                    children:
                                                                      "Monthly Growth",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 463,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  "div",
                                                                  {
                                                                    className:
                                                                      "flex items-center space-x-2",
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        Re,
                                                                        {
                                                                          className:
                                                                            "h-4 w-4 text-green-600",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                          lineNumber: 465,
                                                                          columnNumber: 31,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        "span",
                                                                        {
                                                                          className:
                                                                            "text-sm font-bold text-green-600",
                                                                          children:
                                                                            [
                                                                              "+",
                                                                              y.monthlyGrowth,
                                                                              "%",
                                                                            ],
                                                                        },
                                                                        void 0,
                                                                        !0,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                          lineNumber: 466,
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
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 464,
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
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 462,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            T,
                                                            {
                                                              value:
                                                                y.monthlyGrowth,
                                                              className: "h-2",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 471,
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
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 461,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: "space-y-2",
                                                        children: [
                                                          e.jsxDEV(
                                                            "h4",
                                                            {
                                                              className:
                                                                "font-medium text-gray-900",
                                                              children:
                                                                "Top Countries",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 475,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          y.topCountries &&
                                                          y.topCountries
                                                            .length > 0
                                                            ? y.topCountries
                                                                .slice(0, 3)
                                                                .map((s, i) =>
                                                                  e.jsxDEV(
                                                                    "div",
                                                                    {
                                                                      className:
                                                                        "flex items-center justify-between",
                                                                      children:
                                                                        [
                                                                          e.jsxDEV(
                                                                            "span",
                                                                            {
                                                                              className:
                                                                                "text-sm text-gray-600",
                                                                              children:
                                                                                s.country,
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                              lineNumber: 481,
                                                                              columnNumber: 35,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          e.jsxDEV(
                                                                            "span",
                                                                            {
                                                                              className:
                                                                                "text-sm font-bold",
                                                                              children:
                                                                                s.users.toLocaleString(),
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                              lineNumber: 482,
                                                                              columnNumber: 35,
                                                                            },
                                                                            this,
                                                                          ),
                                                                        ],
                                                                    },
                                                                    i,
                                                                    !0,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                      lineNumber: 480,
                                                                      columnNumber: 33,
                                                                    },
                                                                    this,
                                                                  ),
                                                                )
                                                            : e.jsxDEV(
                                                                "p",
                                                                {
                                                                  className:
                                                                    "text-sm text-gray-500",
                                                                  children:
                                                                    "No data available",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 488,
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
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 474,
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
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 445,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 441,
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
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 434,
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
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 379,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          n,
                          {
                            children: [
                              e.jsxDEV(
                                l,
                                {
                                  children: e.jsxDEV(
                                    o,
                                    {
                                      className: "flex items-center",
                                      children: [
                                        e.jsxDEV(
                                          ie,
                                          { className: "h-5 w-5 mr-2" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 501,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        "Recent Activity",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 500,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 499,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                m,
                                {
                                  children: ke
                                    ? e.jsxDEV(
                                        d,
                                        { className: "h-48 w-full" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                          lineNumber: 507,
                                          columnNumber: 21,
                                        },
                                        this,
                                      )
                                    : Y.length > 0
                                      ? e.jsxDEV(
                                          "div",
                                          {
                                            className: "space-y-4",
                                            children: Y.map((s, i) =>
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "flex items-center space-x-4 p-3 bg-gray-50 rounded-lg",
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: `w-2 h-2 rounded-full ${s.type === "success" ? "bg-green-500" : s.type === "error" ? "bg-red-500" : "bg-blue-500"}`,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 515,
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
                                                            "p",
                                                            {
                                                              className:
                                                                "text-sm font-medium text-gray-900",
                                                              children:
                                                                s.action,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 525,
                                                              columnNumber: 29,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "p",
                                                            {
                                                              className:
                                                                "text-xs text-gray-500",
                                                              children: s.user,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 526,
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
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 524,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "span",
                                                      {
                                                        className:
                                                          "text-xs text-gray-400",
                                                        children: s.time,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 528,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                  ],
                                                },
                                                i,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 511,
                                                  columnNumber: 25,
                                                },
                                                this,
                                              ),
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 509,
                                            columnNumber: 21,
                                          },
                                          this,
                                        )
                                      : e.jsxDEV(
                                          "div",
                                          {
                                            className: "text-center py-8",
                                            children: [
                                              e.jsxDEV(
                                                ie,
                                                {
                                                  className:
                                                    "h-12 w-12 text-gray-400 mx-auto mb-4",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 534,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className: "text-gray-600",
                                                  children:
                                                    "No recent activity",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 535,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 533,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 505,
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
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 498,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          n,
                          {
                            children: [
                              e.jsxDEV(
                                l,
                                {
                                  children: e.jsxDEV(
                                    o,
                                    {
                                      className: "flex items-center",
                                      children: [
                                        e.jsxDEV(
                                          ae,
                                          { className: "h-5 w-5 mr-2" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 545,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        "External API Status",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 544,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 543,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                m,
                                {
                                  children: e.jsxDEV(
                                    "div",
                                    {
                                      className:
                                        "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3",
                                      children: [
                                        {
                                          name: "Stripe",
                                          status: "operational",
                                          latency: 45,
                                        },
                                        {
                                          name: "LabelGrid",
                                          status: "operational",
                                          latency: 78,
                                        },
                                        {
                                          name: "Spotify",
                                          status: "operational",
                                          latency: 52,
                                        },
                                        {
                                          name: "Apple Music",
                                          status: "operational",
                                          latency: 68,
                                        },
                                        {
                                          name: "YouTube",
                                          status: "operational",
                                          latency: 42,
                                        },
                                        {
                                          name: "Twitter",
                                          status: "operational",
                                          latency: 35,
                                        },
                                        {
                                          name: "Instagram",
                                          status: "operational",
                                          latency: 48,
                                        },
                                        {
                                          name: "TikTok",
                                          status: "operational",
                                          latency: 62,
                                        },
                                      ].map((s) =>
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: `p-3 rounded-lg border ${s.status === "operational" ? "bg-green-50 border-green-200" : s.status === "degraded" ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}`,
                                            children: [
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "flex items-center gap-2 mb-1",
                                                  children: [
                                                    s.status === "operational"
                                                      ? e.jsxDEV(
                                                          $,
                                                          {
                                                            className:
                                                              "h-3 w-3 text-green-600",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 573,
                                                            columnNumber: 29,
                                                          },
                                                          this,
                                                        )
                                                      : s.status === "degraded"
                                                        ? e.jsxDEV(
                                                            Q,
                                                            {
                                                              className:
                                                                "h-3 w-3 text-yellow-600",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 575,
                                                              columnNumber: 29,
                                                            },
                                                            this,
                                                          )
                                                        : e.jsxDEV(
                                                            ne,
                                                            {
                                                              className:
                                                                "h-3 w-3 text-red-600",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 577,
                                                              columnNumber: 29,
                                                            },
                                                            this,
                                                          ),
                                                    e.jsxDEV(
                                                      "span",
                                                      {
                                                        className:
                                                          "text-xs font-medium truncate",
                                                        children: s.name,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 579,
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
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 571,
                                                  columnNumber: 25,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-xs text-gray-500",
                                                  children: [s.latency, "ms"],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 581,
                                                  columnNumber: 25,
                                                },
                                                this,
                                              ),
                                            ],
                                          },
                                          s.name,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 561,
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
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 550,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 549,
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
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 542,
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
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 378,
                      columnNumber: 13,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    A,
                    {
                      value: "audit",
                      className: "space-y-6",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "grid grid-cols-1 lg:grid-cols-2 gap-6",
                            children: [
                              e.jsxDEV(
                                n,
                                {
                                  children: [
                                    e.jsxDEV(
                                      l,
                                      {
                                        children: e.jsxDEV(
                                          o,
                                          {
                                            className: "flex items-center",
                                            children: [
                                              e.jsxDEV(
                                                q,
                                                { className: "h-5 w-5 mr-2" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 596,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              "Audit Scores",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 595,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 594,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      m,
                                      {
                                        children:
                                          U || !a
                                            ? e.jsxDEV(
                                                d,
                                                { className: "h-64 w-full" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 602,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              )
                                            : e.jsxDEV(
                                                "div",
                                                {
                                                  className: "space-y-4",
                                                  children: [
                                                    {
                                                      name: "Security",
                                                      score: a.securityScore,
                                                      icon: q,
                                                    },
                                                    {
                                                      name: "Functionality",
                                                      score:
                                                        a.functionalityScore,
                                                      icon: $,
                                                    },
                                                    {
                                                      name: "Performance",
                                                      score: a.performanceScore,
                                                      icon: z,
                                                    },
                                                    {
                                                      name: "Code Quality",
                                                      score: a.codeQualityScore,
                                                      icon: te,
                                                    },
                                                    {
                                                      name: "Accessibility",
                                                      score:
                                                        a.accessibilityScore,
                                                      icon: G,
                                                    },
                                                    {
                                                      name: "SEO",
                                                      score: a.seoScore,
                                                      icon: Ue,
                                                    },
                                                  ].map((s, i) => {
                                                    const H = M(s.score);
                                                    return e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: "space-y-2",
                                                        children: [
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "flex items-center justify-between",
                                                              children: [
                                                                e.jsxDEV(
                                                                  "div",
                                                                  {
                                                                    className:
                                                                      "flex items-center space-x-3",
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        s.icon,
                                                                        {
                                                                          className:
                                                                            "h-5 w-5 text-gray-600",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                          lineNumber: 626,
                                                                          columnNumber: 35,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        "span",
                                                                        {
                                                                          className:
                                                                            "text-sm font-medium",
                                                                          children:
                                                                            s.name,
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                          lineNumber: 627,
                                                                          columnNumber: 35,
                                                                        },
                                                                        this,
                                                                      ),
                                                                    ],
                                                                  },
                                                                  void 0,
                                                                  !0,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 625,
                                                                    columnNumber: 33,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  "span",
                                                                  {
                                                                    className: `text-sm font-bold ${H.color}`,
                                                                    children: [
                                                                      s.score,
                                                                      "/100",
                                                                    ],
                                                                  },
                                                                  void 0,
                                                                  !0,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 629,
                                                                    columnNumber: 33,
                                                                  },
                                                                  this,
                                                                ),
                                                              ],
                                                            },
                                                            void 0,
                                                            !0,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 624,
                                                              columnNumber: 31,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            T,
                                                            {
                                                              value: s.score,
                                                              className: "h-2",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 633,
                                                              columnNumber: 31,
                                                            },
                                                            this,
                                                          ),
                                                        ],
                                                      },
                                                      i,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 623,
                                                        columnNumber: 29,
                                                      },
                                                      this,
                                                    );
                                                  }),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 604,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 600,
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
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 593,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-6",
                                  children: [
                                    e.jsxDEV(
                                      n,
                                      {
                                        children: [
                                          e.jsxDEV(
                                            l,
                                            {
                                              children: e.jsxDEV(
                                                o,
                                                {
                                                  className:
                                                    "flex items-center",
                                                  children: [
                                                    e.jsxDEV(
                                                      Q,
                                                      {
                                                        className:
                                                          "h-5 w-5 mr-2",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 648,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    "Issues ",
                                                    a &&
                                                      `(${a.issues?.length ?? 0})`,
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 647,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 646,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            m,
                                            {
                                              children:
                                                U || !a
                                                  ? e.jsxDEV(
                                                      d,
                                                      {
                                                        className:
                                                          "h-32 w-full",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 654,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    )
                                                  : e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: "space-y-3",
                                                        children: [
                                                          a.issues.map((s, i) =>
                                                            e.jsxDEV(
                                                              me,
                                                              {
                                                                className: `${s.severity === "critical" ? "border-red-200 bg-red-50" : s.severity === "high" ? "border-orange-200 bg-orange-50" : "border-yellow-200 bg-yellow-50"}`,
                                                                children: [
                                                                  e.jsxDEV(
                                                                    Q,
                                                                    {
                                                                      className:
                                                                        "h-4 w-4",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                      lineNumber: 668,
                                                                      columnNumber: 31,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    le,
                                                                    {
                                                                      children:
                                                                        e.jsxDEV(
                                                                          "div",
                                                                          {
                                                                            children:
                                                                              [
                                                                                e.jsxDEV(
                                                                                  "p",
                                                                                  {
                                                                                    className:
                                                                                      "font-medium text-gray-900",
                                                                                    children:
                                                                                      s.title,
                                                                                  },
                                                                                  void 0,
                                                                                  !1,
                                                                                  {
                                                                                    fileName:
                                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                    lineNumber: 671,
                                                                                    columnNumber: 35,
                                                                                  },
                                                                                  this,
                                                                                ),
                                                                                e.jsxDEV(
                                                                                  "p",
                                                                                  {
                                                                                    className:
                                                                                      "text-sm text-gray-600 mt-1",
                                                                                    children:
                                                                                      s.description,
                                                                                  },
                                                                                  void 0,
                                                                                  !1,
                                                                                  {
                                                                                    fileName:
                                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                    lineNumber: 672,
                                                                                    columnNumber: 35,
                                                                                  },
                                                                                  this,
                                                                                ),
                                                                                e.jsxDEV(
                                                                                  w,
                                                                                  {
                                                                                    variant:
                                                                                      "outline",
                                                                                    className:
                                                                                      "mt-2",
                                                                                    children:
                                                                                      s.severity,
                                                                                  },
                                                                                  void 0,
                                                                                  !1,
                                                                                  {
                                                                                    fileName:
                                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                    lineNumber: 673,
                                                                                    columnNumber: 35,
                                                                                  },
                                                                                  this,
                                                                                ),
                                                                              ],
                                                                          },
                                                                          void 0,
                                                                          !0,
                                                                          {
                                                                            fileName:
                                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                            lineNumber: 670,
                                                                            columnNumber: 33,
                                                                          },
                                                                          this,
                                                                        ),
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                      lineNumber: 669,
                                                                      columnNumber: 31,
                                                                    },
                                                                    this,
                                                                  ),
                                                                ],
                                                              },
                                                              i,
                                                              !0,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                lineNumber: 658,
                                                                columnNumber: 29,
                                                              },
                                                              this,
                                                            ),
                                                          ),
                                                          (a.issues?.length ??
                                                            0) === 0 &&
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "text-center py-8",
                                                                children: [
                                                                  e.jsxDEV(
                                                                    $,
                                                                    {
                                                                      className:
                                                                        "h-12 w-12 text-green-500 mx-auto mb-4",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                      lineNumber: 682,
                                                                      columnNumber: 31,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "p",
                                                                    {
                                                                      className:
                                                                        "text-gray-600",
                                                                      children:
                                                                        "No issues found!",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                      lineNumber: 683,
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
                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                lineNumber: 681,
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
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 656,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 652,
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
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 645,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      n,
                                      {
                                        children: [
                                          e.jsxDEV(
                                            l,
                                            {
                                              children: e.jsxDEV(
                                                o,
                                                {
                                                  className:
                                                    "flex items-center",
                                                  children: [
                                                    e.jsxDEV(
                                                      qe,
                                                      {
                                                        className:
                                                          "h-5 w-5 mr-2",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 695,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    "Recommendations ",
                                                    a &&
                                                      `(${a.recommendations?.length ?? 0})`,
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 694,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 693,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            m,
                                            {
                                              children:
                                                U || !a
                                                  ? e.jsxDEV(
                                                      d,
                                                      {
                                                        className:
                                                          "h-32 w-full",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 701,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    )
                                                  : e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: "space-y-3",
                                                        children: [
                                                          a.recommendations.map(
                                                            (s, i) =>
                                                              e.jsxDEV(
                                                                "div",
                                                                {
                                                                  className:
                                                                    "p-3 bg-blue-50 border border-blue-200 rounded-lg",
                                                                  children:
                                                                    e.jsxDEV(
                                                                      "div",
                                                                      {
                                                                        className:
                                                                          "flex items-start justify-between",
                                                                        children:
                                                                          [
                                                                            e.jsxDEV(
                                                                              "div",
                                                                              {
                                                                                className:
                                                                                  "flex-1",
                                                                                children:
                                                                                  [
                                                                                    e.jsxDEV(
                                                                                      "p",
                                                                                      {
                                                                                        className:
                                                                                          "font-medium text-gray-900",
                                                                                        children:
                                                                                          s.title,
                                                                                      },
                                                                                      void 0,
                                                                                      !1,
                                                                                      {
                                                                                        fileName:
                                                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                        lineNumber: 711,
                                                                                        columnNumber: 35,
                                                                                      },
                                                                                      this,
                                                                                    ),
                                                                                    e.jsxDEV(
                                                                                      "p",
                                                                                      {
                                                                                        className:
                                                                                          "text-sm text-gray-600 mt-1",
                                                                                        children:
                                                                                          s.description,
                                                                                      },
                                                                                      void 0,
                                                                                      !1,
                                                                                      {
                                                                                        fileName:
                                                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                        lineNumber: 712,
                                                                                        columnNumber: 35,
                                                                                      },
                                                                                      this,
                                                                                    ),
                                                                                  ],
                                                                              },
                                                                              void 0,
                                                                              !0,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                lineNumber: 710,
                                                                                columnNumber: 33,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              w,
                                                                              {
                                                                                variant:
                                                                                  "outline",
                                                                                className:
                                                                                  "ml-2",
                                                                                children:
                                                                                  s.priority,
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                lineNumber: 714,
                                                                                columnNumber: 33,
                                                                              },
                                                                              this,
                                                                            ),
                                                                          ],
                                                                      },
                                                                      void 0,
                                                                      !0,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                        lineNumber: 709,
                                                                        columnNumber: 31,
                                                                      },
                                                                      this,
                                                                    ),
                                                                },
                                                                i,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 705,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                          ),
                                                          (a.recommendations
                                                            ?.length ?? 0) ===
                                                            0 &&
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "text-center py-8",
                                                                children: [
                                                                  e.jsxDEV(
                                                                    $e,
                                                                    {
                                                                      className:
                                                                        "h-12 w-12 text-blue-500 mx-auto mb-4",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                      lineNumber: 722,
                                                                      columnNumber: 31,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "p",
                                                                    {
                                                                      className:
                                                                        "text-gray-600",
                                                                      children:
                                                                        "No recommendations at this time",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                      lineNumber: 723,
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
                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                lineNumber: 721,
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
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 703,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 699,
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
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 692,
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
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 643,
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
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 591,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          n,
                          {
                            children: [
                              e.jsxDEV(
                                l,
                                {
                                  children: e.jsxDEV(
                                    o,
                                    {
                                      className: "flex items-center",
                                      children: [
                                        e.jsxDEV(
                                          Pe,
                                          { className: "h-5 w-5 mr-2" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 737,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        "Compliance Status",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 736,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 735,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                m,
                                {
                                  children:
                                    U || !a
                                      ? e.jsxDEV(
                                          d,
                                          { className: "h-32 w-full" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 743,
                                            columnNumber: 21,
                                          },
                                          this,
                                        )
                                      : e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "grid grid-cols-2 md:grid-cols-5 gap-4",
                                            children: Object.entries(
                                              a.compliance,
                                            ).map(([s, i]) =>
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className: `p-4 rounded-lg text-center ${i ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200"}`,
                                                  children: [
                                                    i
                                                      ? e.jsxDEV(
                                                          Fe,
                                                          {
                                                            className:
                                                              "h-6 w-6 text-green-600 mx-auto mb-2",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 756,
                                                            columnNumber: 29,
                                                          },
                                                          this,
                                                        )
                                                      : e.jsxDEV(
                                                          Me,
                                                          {
                                                            className:
                                                              "h-6 w-6 text-gray-400 mx-auto mb-2",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 758,
                                                            columnNumber: 29,
                                                          },
                                                          this,
                                                        ),
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className:
                                                          "text-sm font-medium uppercase",
                                                        children: s,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 760,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                  ],
                                                },
                                                s,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 747,
                                                  columnNumber: 25,
                                                },
                                                this,
                                              ),
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 745,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 741,
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
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 734,
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
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 590,
                      columnNumber: 13,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    A,
                    {
                      value: "testing",
                      className: "space-y-6",
                      children: e.jsxDEV(
                        "div",
                        {
                          className: "grid grid-cols-1 lg:grid-cols-2 gap-6",
                          children: [
                            e.jsxDEV(
                              n,
                              {
                                children: [
                                  e.jsxDEV(
                                    l,
                                    {
                                      children: e.jsxDEV(
                                        o,
                                        {
                                          className: "flex items-center",
                                          children: [
                                            e.jsxDEV(
                                              re,
                                              { className: "h-5 w-5 mr-2" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 776,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                            "Test Coverage",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                          lineNumber: 775,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 774,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    m,
                                    {
                                      children:
                                        K || !c
                                          ? e.jsxDEV(
                                              d,
                                              { className: "h-64 w-full" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 782,
                                                columnNumber: 23,
                                              },
                                              this,
                                            )
                                          : e.jsxDEV(
                                              "div",
                                              {
                                                className: "space-y-4",
                                                children: [
                                                  {
                                                    name: "Unit Tests",
                                                    score: c.unitTestScore,
                                                    icon: $,
                                                  },
                                                  {
                                                    name: "Integration Tests",
                                                    score:
                                                      c.integrationTestScore,
                                                    icon: z,
                                                  },
                                                  {
                                                    name: "E2E Tests",
                                                    score: c.e2eTestScore,
                                                    icon: G,
                                                  },
                                                  {
                                                    name: "Performance Tests",
                                                    score:
                                                      c.performanceTestScore,
                                                    icon: W,
                                                  },
                                                  {
                                                    name: "Security Tests",
                                                    score: c.securityTestScore,
                                                    icon: q,
                                                  },
                                                  {
                                                    name: "Accessibility Tests",
                                                    score:
                                                      c.accessibilityTestScore,
                                                    icon: O,
                                                  },
                                                ].map((s, i) => {
                                                  const H = M(s.score);
                                                  return e.jsxDEV(
                                                    "div",
                                                    {
                                                      className: "space-y-2",
                                                      children: [
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "flex items-center justify-between",
                                                            children: [
                                                              e.jsxDEV(
                                                                "div",
                                                                {
                                                                  className:
                                                                    "flex items-center space-x-3",
                                                                  children: [
                                                                    e.jsxDEV(
                                                                      s.icon,
                                                                      {
                                                                        className:
                                                                          "h-5 w-5 text-gray-600",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                        lineNumber: 814,
                                                                        columnNumber: 35,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    e.jsxDEV(
                                                                      "span",
                                                                      {
                                                                        className:
                                                                          "text-sm font-medium",
                                                                        children:
                                                                          s.name,
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                        lineNumber: 815,
                                                                        columnNumber: 35,
                                                                      },
                                                                      this,
                                                                    ),
                                                                  ],
                                                                },
                                                                void 0,
                                                                !0,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 813,
                                                                  columnNumber: 33,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "span",
                                                                {
                                                                  className: `text-sm font-bold ${H.color}`,
                                                                  children: [
                                                                    s.score,
                                                                    "/100",
                                                                  ],
                                                                },
                                                                void 0,
                                                                !0,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 817,
                                                                  columnNumber: 33,
                                                                },
                                                                this,
                                                              ),
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 812,
                                                            columnNumber: 31,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          T,
                                                          {
                                                            value: s.score,
                                                            className: "h-2",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 821,
                                                            columnNumber: 31,
                                                          },
                                                          this,
                                                        ),
                                                      ],
                                                    },
                                                    i,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                      lineNumber: 811,
                                                      columnNumber: 29,
                                                    },
                                                    this,
                                                  );
                                                }),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 784,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 780,
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
                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                lineNumber: 773,
                                columnNumber: 17,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              n,
                              {
                                children: [
                                  e.jsxDEV(
                                    l,
                                    {
                                      children: e.jsxDEV(
                                        o,
                                        {
                                          className: "flex items-center",
                                          children: [
                                            e.jsxDEV(
                                              Oe,
                                              { className: "h-5 w-5 mr-2" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 834,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                            "Test Statistics",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                          lineNumber: 833,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 832,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    m,
                                    {
                                      children:
                                        K || !c
                                          ? e.jsxDEV(
                                              d,
                                              { className: "h-64 w-full" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 840,
                                                columnNumber: 23,
                                              },
                                              this,
                                            )
                                          : e.jsxDEV(
                                              "div",
                                              {
                                                className: "space-y-6",
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "grid grid-cols-2 gap-4",
                                                      children: [
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "text-center p-4 bg-green-50 rounded-lg",
                                                            children: [
                                                              e.jsxDEV(
                                                                "p",
                                                                {
                                                                  className:
                                                                    "text-2xl font-bold text-green-600",
                                                                  children:
                                                                    c.passedTests,
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 845,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "p",
                                                                {
                                                                  className:
                                                                    "text-sm text-green-600",
                                                                  children:
                                                                    "Passed",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 848,
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
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 844,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "text-center p-4 bg-red-50 rounded-lg",
                                                            children: [
                                                              e.jsxDEV(
                                                                "p",
                                                                {
                                                                  className:
                                                                    "text-2xl font-bold text-red-600",
                                                                  children:
                                                                    c.failedTests,
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 851,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "p",
                                                                {
                                                                  className:
                                                                    "text-sm text-red-600",
                                                                  children:
                                                                    "Failed",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 854,
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
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 850,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "text-center p-4 bg-yellow-50 rounded-lg",
                                                            children: [
                                                              e.jsxDEV(
                                                                "p",
                                                                {
                                                                  className:
                                                                    "text-2xl font-bold text-yellow-600",
                                                                  children:
                                                                    c.skippedTests,
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 857,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "p",
                                                                {
                                                                  className:
                                                                    "text-sm text-yellow-600",
                                                                  children:
                                                                    "Skipped",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 860,
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
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 856,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "text-center p-4 bg-blue-50 rounded-lg",
                                                            children: [
                                                              e.jsxDEV(
                                                                "p",
                                                                {
                                                                  className:
                                                                    "text-2xl font-bold text-blue-600",
                                                                  children:
                                                                    c.totalTests,
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 863,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "p",
                                                                {
                                                                  className:
                                                                    "text-sm text-blue-600",
                                                                  children:
                                                                    "Total Tests",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 866,
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
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 862,
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
                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                      lineNumber: 843,
                                                      columnNumber: 25,
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
                                                              "font-medium text-gray-900 mb-3",
                                                            children:
                                                              "Code Coverage",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 871,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "space-y-3",
                                                            children:
                                                              Object.entries(
                                                                c.coverage,
                                                              ).map(([s, i]) =>
                                                                e.jsxDEV(
                                                                  "div",
                                                                  {
                                                                    className:
                                                                      "space-y-1",
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        "div",
                                                                        {
                                                                          className:
                                                                            "flex items-center justify-between",
                                                                          children:
                                                                            [
                                                                              e.jsxDEV(
                                                                                "span",
                                                                                {
                                                                                  className:
                                                                                    "text-sm text-gray-600 capitalize",
                                                                                  children:
                                                                                    s,
                                                                                },
                                                                                void 0,
                                                                                !1,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                  lineNumber: 877,
                                                                                  columnNumber: 37,
                                                                                },
                                                                                this,
                                                                              ),
                                                                              e.jsxDEV(
                                                                                "span",
                                                                                {
                                                                                  className:
                                                                                    "text-sm font-bold",
                                                                                  children:
                                                                                    [
                                                                                      i,
                                                                                      "%",
                                                                                    ],
                                                                                },
                                                                                void 0,
                                                                                !0,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                  lineNumber: 878,
                                                                                  columnNumber: 37,
                                                                                },
                                                                                this,
                                                                              ),
                                                                            ],
                                                                        },
                                                                        void 0,
                                                                        !0,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                          lineNumber: 876,
                                                                          columnNumber: 35,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        T,
                                                                        {
                                                                          value:
                                                                            i,
                                                                          className:
                                                                            "h-2",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                          lineNumber: 880,
                                                                          columnNumber: 35,
                                                                        },
                                                                        this,
                                                                      ),
                                                                    ],
                                                                  },
                                                                  s,
                                                                  !0,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 875,
                                                                    columnNumber: 33,
                                                                  },
                                                                  this,
                                                                ),
                                                              ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 872,
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
                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                      lineNumber: 870,
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
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 842,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 838,
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
                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                lineNumber: 831,
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
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 771,
                          columnNumber: 15,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 770,
                      columnNumber: 13,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    A,
                    {
                      value: "performance",
                      className: "space-y-6",
                      children: e.jsxDEV(
                        n,
                        {
                          children: [
                            e.jsxDEV(
                              l,
                              {
                                children: e.jsxDEV(
                                  o,
                                  {
                                    className: "flex items-center",
                                    children: [
                                      e.jsxDEV(
                                        z,
                                        { className: "h-5 w-5 mr-2" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                          lineNumber: 898,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                                      "Performance Metrics",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                    lineNumber: 897,
                                    columnNumber: 19,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                lineNumber: 896,
                                columnNumber: 17,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              m,
                              {
                                children:
                                  F || !u
                                    ? e.jsxDEV(
                                        d,
                                        { className: "h-64 w-full" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                          lineNumber: 904,
                                          columnNumber: 21,
                                        },
                                        this,
                                      )
                                    : e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "text-center p-6 bg-gray-50 rounded-lg",
                                          children: [
                                            e.jsxDEV(
                                              W,
                                              {
                                                className:
                                                  "h-12 w-12 text-gray-600 mx-auto mb-4",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 907,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className: "text-gray-600",
                                                children:
                                                  "Performance metrics will be displayed here",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 908,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-sm text-gray-500 mt-2",
                                                children: [
                                                  "Response Time: ",
                                                  u.avgResponseTime ??
                                                    u.responseTime ??
                                                    0,
                                                  "ms",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 909,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                          lineNumber: 906,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                lineNumber: 902,
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
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 895,
                          columnNumber: 15,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 894,
                      columnNumber: 13,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    A,
                    {
                      value: "users",
                      className: "space-y-6",
                      children: [
                        e.jsxDEV(
                          n,
                          {
                            children: [
                              e.jsxDEV(
                                l,
                                {
                                  children: e.jsxDEV(
                                    "div",
                                    {
                                      className:
                                        "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4",
                                      children: [
                                        e.jsxDEV(
                                          o,
                                          {
                                            className: "flex items-center",
                                            children: [
                                              e.jsxDEV(
                                                O,
                                                { className: "h-5 w-5 mr-2" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 924,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              "User Management",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 923,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "flex items-center gap-2",
                                            children: [
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className: "relative",
                                                  children: [
                                                    e.jsxDEV(
                                                      ce,
                                                      {
                                                        className:
                                                          "absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 929,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      Xe,
                                                      {
                                                        type: "text",
                                                        placeholder:
                                                          "Search by name or email...",
                                                        value: p,
                                                        onChange: (s) =>
                                                          r(s.target.value),
                                                        className: "pl-10 w-64",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 930,
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
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 928,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                j,
                                                {
                                                  variant: "outline",
                                                  size: "sm",
                                                  onClick: () => Ee(),
                                                  disabled: B,
                                                  children: e.jsxDEV(
                                                    se,
                                                    {
                                                      className: `h-4 w-4 ${B ? "animate-spin" : ""}`,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                      lineNumber: 944,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 938,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 927,
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
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 922,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 921,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                m,
                                {
                                  children: je
                                    ? e.jsxDEV(
                                        me,
                                        {
                                          variant: "destructive",
                                          children: [
                                            e.jsxDEV(
                                              Ke,
                                              { className: "h-4 w-4" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 952,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              le,
                                              {
                                                children:
                                                  "Failed to load users. Please try again.",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 953,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                          lineNumber: 951,
                                          columnNumber: 21,
                                        },
                                        this,
                                      )
                                    : B
                                      ? e.jsxDEV(
                                          d,
                                          { className: "h-96 w-full" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 958,
                                            columnNumber: 21,
                                          },
                                          this,
                                        )
                                      : g?.users && g.users.length > 0
                                        ? e.jsxDEV(
                                            "div",
                                            {
                                              className: "space-y-4",
                                              children: [
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "rounded-md border",
                                                    children: e.jsxDEV(
                                                      is,
                                                      {
                                                        children: [
                                                          e.jsxDEV(
                                                            ns,
                                                            {
                                                              children:
                                                                e.jsxDEV(
                                                                  oe,
                                                                  {
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        L,
                                                                        {
                                                                          children:
                                                                            "Username",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                          lineNumber: 965,
                                                                          columnNumber: 31,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        L,
                                                                        {
                                                                          children:
                                                                            "Email",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                          lineNumber: 966,
                                                                          columnNumber: 31,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        L,
                                                                        {
                                                                          children:
                                                                            "Role",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                          lineNumber: 967,
                                                                          columnNumber: 31,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        L,
                                                                        {
                                                                          children:
                                                                            "Subscription",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                          lineNumber: 968,
                                                                          columnNumber: 31,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        L,
                                                                        {
                                                                          children:
                                                                            "Status",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                          lineNumber: 969,
                                                                          columnNumber: 31,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        L,
                                                                        {
                                                                          children:
                                                                            "Joined",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                          lineNumber: 970,
                                                                          columnNumber: 31,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        L,
                                                                        {
                                                                          className:
                                                                            "text-right",
                                                                          children:
                                                                            "Actions",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                          lineNumber: 971,
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
                                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                    lineNumber: 964,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 963,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            ms,
                                                            {
                                                              children:
                                                                g.users.map(
                                                                  (s) =>
                                                                    e.jsxDEV(
                                                                      oe,
                                                                      {
                                                                        children:
                                                                          [
                                                                            e.jsxDEV(
                                                                              I,
                                                                              {
                                                                                className:
                                                                                  "font-medium",
                                                                                children:
                                                                                  s.username,
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                lineNumber: 977,
                                                                                columnNumber: 33,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              I,
                                                                              {
                                                                                children:
                                                                                  s.email,
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                lineNumber: 978,
                                                                                columnNumber: 33,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              I,
                                                                              {
                                                                                children:
                                                                                  e.jsxDEV(
                                                                                    w,
                                                                                    {
                                                                                      variant:
                                                                                        s.role ===
                                                                                        "admin"
                                                                                          ? "default"
                                                                                          : "secondary",
                                                                                      children:
                                                                                        s.role ||
                                                                                        "user",
                                                                                    },
                                                                                    void 0,
                                                                                    !1,
                                                                                    {
                                                                                      fileName:
                                                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                      lineNumber: 980,
                                                                                      columnNumber: 35,
                                                                                    },
                                                                                    this,
                                                                                  ),
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                lineNumber: 979,
                                                                                columnNumber: 33,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              I,
                                                                              {
                                                                                children:
                                                                                  s.subscriptionTier
                                                                                    ? e.jsxDEV(
                                                                                        w,
                                                                                        {
                                                                                          variant:
                                                                                            s.subscriptionTier ===
                                                                                            "lifetime"
                                                                                              ? "default"
                                                                                              : "outline",
                                                                                          children:
                                                                                            s.subscriptionTier,
                                                                                        },
                                                                                        void 0,
                                                                                        !1,
                                                                                        {
                                                                                          fileName:
                                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                          lineNumber: 986,
                                                                                          columnNumber: 37,
                                                                                        },
                                                                                        this,
                                                                                      )
                                                                                    : e.jsxDEV(
                                                                                        "span",
                                                                                        {
                                                                                          className:
                                                                                            "text-sm text-gray-500",
                                                                                          children:
                                                                                            "Free",
                                                                                        },
                                                                                        void 0,
                                                                                        !1,
                                                                                        {
                                                                                          fileName:
                                                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                          lineNumber: 996,
                                                                                          columnNumber: 37,
                                                                                        },
                                                                                        this,
                                                                                      ),
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                lineNumber: 984,
                                                                                columnNumber: 33,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              I,
                                                                              {
                                                                                children:
                                                                                  e.jsxDEV(
                                                                                    w,
                                                                                    {
                                                                                      variant:
                                                                                        s.emailVerified
                                                                                          ? "default"
                                                                                          : "secondary",
                                                                                      className:
                                                                                        s.emailVerified
                                                                                          ? "bg-green-100 text-green-800"
                                                                                          : "",
                                                                                      children:
                                                                                        s.emailVerified
                                                                                          ? "Verified"
                                                                                          : "Unverified",
                                                                                    },
                                                                                    void 0,
                                                                                    !1,
                                                                                    {
                                                                                      fileName:
                                                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                      lineNumber: 1e3,
                                                                                      columnNumber: 35,
                                                                                    },
                                                                                    this,
                                                                                  ),
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                lineNumber: 999,
                                                                                columnNumber: 33,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              I,
                                                                              {
                                                                                className:
                                                                                  "text-sm text-gray-500",
                                                                                children:
                                                                                  s.createdAt
                                                                                    ? new Date(
                                                                                        s.createdAt,
                                                                                      ).toLocaleDateString()
                                                                                    : "N/A",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                lineNumber: 1009,
                                                                                columnNumber: 33,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              I,
                                                                              {
                                                                                className:
                                                                                  "text-right",
                                                                                children:
                                                                                  e.jsxDEV(
                                                                                    j,
                                                                                    {
                                                                                      variant:
                                                                                        "ghost",
                                                                                      size: "sm",
                                                                                      onClick:
                                                                                        () => {
                                                                                          (de(
                                                                                            s,
                                                                                          ),
                                                                                            Z(
                                                                                              !0,
                                                                                            ));
                                                                                        },
                                                                                      children:
                                                                                        e.jsxDEV(
                                                                                          G,
                                                                                          {
                                                                                            className:
                                                                                              "h-4 w-4",
                                                                                          },
                                                                                          void 0,
                                                                                          !1,
                                                                                          {
                                                                                            fileName:
                                                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                            lineNumber: 1023,
                                                                                            columnNumber: 37,
                                                                                          },
                                                                                          this,
                                                                                        ),
                                                                                    },
                                                                                    void 0,
                                                                                    !1,
                                                                                    {
                                                                                      fileName:
                                                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                      lineNumber: 1015,
                                                                                      columnNumber: 35,
                                                                                    },
                                                                                    this,
                                                                                  ),
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                                lineNumber: 1014,
                                                                                columnNumber: 33,
                                                                              },
                                                                              this,
                                                                            ),
                                                                          ],
                                                                      },
                                                                      s.id,
                                                                      !0,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                        lineNumber: 976,
                                                                        columnNumber: 31,
                                                                      },
                                                                      this,
                                                                    ),
                                                                ),
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                              lineNumber: 974,
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
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 962,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                    lineNumber: 961,
                                                    columnNumber: 23,
                                                  },
                                                  this,
                                                ),
                                                g.pagination &&
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex items-center justify-between",
                                                      children: [
                                                        e.jsxDEV(
                                                          "p",
                                                          {
                                                            className:
                                                              "text-sm text-gray-600",
                                                            children: [
                                                              "Showing ",
                                                              g.pagination
                                                                .offset + 1,
                                                              " to",
                                                              " ",
                                                              Math.min(
                                                                g.pagination
                                                                  .offset +
                                                                  g.pagination
                                                                    .limit,
                                                                g.pagination
                                                                  .total,
                                                              ),
                                                              " ",
                                                              "of ",
                                                              g.pagination
                                                                .total,
                                                              " users",
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 1035,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "flex gap-2",
                                                            children: [
                                                              e.jsxDEV(
                                                                j,
                                                                {
                                                                  variant:
                                                                    "outline",
                                                                  size: "sm",
                                                                  onClick: () =>
                                                                    t((s) =>
                                                                      Math.max(
                                                                        1,
                                                                        s - 1,
                                                                      ),
                                                                    ),
                                                                  disabled:
                                                                    h === 1,
                                                                  children:
                                                                    "Previous",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 1044,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                j,
                                                                {
                                                                  variant:
                                                                    "outline",
                                                                  size: "sm",
                                                                  onClick: () =>
                                                                    t(
                                                                      (s) =>
                                                                        s + 1,
                                                                    ),
                                                                  disabled:
                                                                    !g.pagination ||
                                                                    h >=
                                                                      Math.ceil(
                                                                        g
                                                                          .pagination
                                                                          .total /
                                                                          g
                                                                            .pagination
                                                                            .limit,
                                                                      ),
                                                                  children:
                                                                    "Next",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                  lineNumber: 1052,
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
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 1043,
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
                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                      lineNumber: 1034,
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
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 960,
                                              columnNumber: 21,
                                            },
                                            this,
                                          )
                                        : e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "text-center p-6 bg-gray-50 rounded-lg",
                                              children: [
                                                e.jsxDEV(
                                                  O,
                                                  {
                                                    className:
                                                      "h-12 w-12 text-gray-600 mx-auto mb-4",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                    lineNumber: 1069,
                                                    columnNumber: 23,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "p",
                                                  {
                                                    className: "text-gray-600",
                                                    children: D
                                                      ? "No users match your search"
                                                      : "No users found",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                    lineNumber: 1070,
                                                    columnNumber: 23,
                                                  },
                                                  this,
                                                ),
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 1068,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 949,
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
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 920,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          Ze,
                          {
                            open: he,
                            onOpenChange: Z,
                            children: e.jsxDEV(
                              Ye,
                              {
                                className: "max-w-md",
                                children: [
                                  e.jsxDEV(
                                    _e,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          es,
                                          { children: "User Details" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 1082,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          ss,
                                          {
                                            children:
                                              "Detailed information about this user account",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 1083,
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
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 1081,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                  N &&
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "space-y-4",
                                        children: e.jsxDEV(
                                          "div",
                                          {
                                            className: "grid grid-cols-2 gap-4",
                                            children: [
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  children: [
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className:
                                                          "text-sm font-medium text-gray-500",
                                                        children: "Username",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 1091,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className: "text-sm",
                                                        children: N.username,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 1092,
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
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 1090,
                                                  columnNumber: 25,
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
                                                          "text-sm font-medium text-gray-500",
                                                        children: "Email",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 1095,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className: "text-sm",
                                                        children: N.email,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 1096,
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
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 1094,
                                                  columnNumber: 25,
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
                                                          "text-sm font-medium text-gray-500",
                                                        children: "Role",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 1099,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      w,
                                                      {
                                                        variant:
                                                          N.role === "admin"
                                                            ? "default"
                                                            : "secondary",
                                                        children:
                                                          N.role || "user",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 1100,
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
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 1098,
                                                  columnNumber: 25,
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
                                                          "text-sm font-medium text-gray-500",
                                                        children:
                                                          "Subscription",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 1105,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                    N.subscriptionTier
                                                      ? e.jsxDEV(
                                                          w,
                                                          {
                                                            variant: "outline",
                                                            children:
                                                              N.subscriptionTier,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 1107,
                                                            columnNumber: 29,
                                                          },
                                                          this,
                                                        )
                                                      : e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "text-sm text-gray-500",
                                                            children: "Free",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 1109,
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
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 1104,
                                                  columnNumber: 25,
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
                                                          "text-sm font-medium text-gray-500",
                                                        children:
                                                          "Email Verified",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 1113,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      w,
                                                      {
                                                        variant: N.emailVerified
                                                          ? "default"
                                                          : "secondary",
                                                        className:
                                                          N.emailVerified
                                                            ? "bg-green-100 text-green-800"
                                                            : "",
                                                        children:
                                                          N.emailVerified
                                                            ? "Yes"
                                                            : "No",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 1114,
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
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 1112,
                                                  columnNumber: 25,
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
                                                          "text-sm font-medium text-gray-500",
                                                        children: "Joined",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 1122,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className: "text-sm",
                                                        children: N.createdAt
                                                          ? new Date(
                                                              N.createdAt,
                                                            ).toLocaleDateString()
                                                          : "N/A",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                        lineNumber: 1123,
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
                                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                  lineNumber: 1121,
                                                  columnNumber: 25,
                                                },
                                                this,
                                              ),
                                              N.stripeCustomerId &&
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "col-span-2",
                                                    children: [
                                                      e.jsxDEV(
                                                        "p",
                                                        {
                                                          className:
                                                            "text-sm font-medium text-gray-500",
                                                          children:
                                                            "Stripe Customer ID",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                          lineNumber: 1131,
                                                          columnNumber: 29,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        "p",
                                                        {
                                                          className:
                                                            "text-sm font-mono text-xs",
                                                          children:
                                                            N.stripeCustomerId,
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                          lineNumber: 1132,
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
                                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                    lineNumber: 1130,
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
                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                            lineNumber: 1089,
                                            columnNumber: 23,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 1088,
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
                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                lineNumber: 1080,
                                columnNumber: 17,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1079,
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
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 919,
                      columnNumber: 13,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    A,
                    {
                      value: "compliance",
                      className: "space-y-6",
                      children: e.jsxDEV(
                        n,
                        {
                          children: [
                            e.jsxDEV(
                              l,
                              {
                                children: e.jsxDEV(
                                  o,
                                  {
                                    className: "flex items-center",
                                    children: [
                                      e.jsxDEV(
                                        q,
                                        { className: "h-5 w-5 mr-2" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                          lineNumber: 1147,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                                      "Compliance Overview",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                    lineNumber: 1146,
                                    columnNumber: 19,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                lineNumber: 1145,
                                columnNumber: 17,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              m,
                              {
                                children:
                                  U || !a
                                    ? e.jsxDEV(
                                        d,
                                        { className: "h-64 w-full" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                          lineNumber: 1153,
                                          columnNumber: 21,
                                        },
                                        this,
                                      )
                                    : e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
                                          children: Object.entries(
                                            a.compliance,
                                          ).map(([s, i]) =>
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className: `p-6 rounded-lg ${i ? "bg-green-50 border-2 border-green-200" : "bg-gray-50 border-2 border-gray-200"}`,
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex items-center justify-between mb-3",
                                                      children: [
                                                        e.jsxDEV(
                                                          "h3",
                                                          {
                                                            className:
                                                              "text-lg font-semibold uppercase",
                                                            children: s,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                            lineNumber: 1166,
                                                            columnNumber: 29,
                                                          },
                                                          this,
                                                        ),
                                                        i
                                                          ? e.jsxDEV(
                                                              $,
                                                              {
                                                                className:
                                                                  "h-6 w-6 text-green-600",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                lineNumber: 1168,
                                                                columnNumber: 31,
                                                              },
                                                              this,
                                                            )
                                                          : e.jsxDEV(
                                                              ne,
                                                              {
                                                                className:
                                                                  "h-6 w-6 text-gray-400",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                                lineNumber: 1170,
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
                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                      lineNumber: 1165,
                                                      columnNumber: 27,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "p",
                                                    {
                                                      className: `text-sm ${i ? "text-green-700" : "text-gray-600"}`,
                                                      children: i
                                                        ? "Compliant"
                                                        : "Not Configured",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                      lineNumber: 1173,
                                                      columnNumber: 27,
                                                    },
                                                    this,
                                                  ),
                                                ],
                                              },
                                              s,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 1157,
                                                columnNumber: 25,
                                              },
                                              this,
                                            ),
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                          lineNumber: 1155,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                lineNumber: 1151,
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
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 1144,
                          columnNumber: 15,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1143,
                      columnNumber: 13,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    A,
                    {
                      value: "tokens",
                      className: "space-y-6",
                      children: e.jsxDEV(
                        ls,
                        {},
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 1186,
                          columnNumber: 15,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1185,
                      columnNumber: 13,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    A,
                    {
                      value: "webhooks",
                      className: "space-y-6",
                      children: e.jsxDEV(
                        os,
                        {},
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 1191,
                          columnNumber: 15,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1190,
                      columnNumber: 13,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    A,
                    {
                      value: "logs",
                      className: "space-y-6",
                      children: e.jsxDEV(
                        ts,
                        {},
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 1196,
                          columnNumber: 15,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1195,
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
                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                lineNumber: 346,
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
            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
          lineNumber: 230,
          columnNumber: 7,
        },
        this,
      ),
    },
    void 0,
    !1,
    {
      fileName: "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
      lineNumber: 229,
      columnNumber: 5,
    },
    this,
  );
}
function ls() {
  const { toast: x } = ue(),
    [E, C] = b.useState(""),
    [f, v] = b.useState(""),
    { mutate: V, isPending: h } = J({
      mutationFn: async () => {
        const r = X(),
          D = await fetch("/api/auth/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(r ? { "x-csrf-token": r } : {}),
            },
            credentials: "include",
          });
        if (!D.ok) throw new Error("Failed to issue token");
        return D.json();
      },
      onSuccess: (r) => {
        x({
          title: "Token issued",
          description: `Access: ${r.accessToken?.substring(0, 20)}...  Refresh: ${r.refreshToken?.substring(0, 20)}...`,
        });
      },
    }),
    { mutate: t, isPending: p } = J({
      mutationFn: async (r) => {
        const D = X(),
          P = await fetch("/api/auth/token/revoke", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(D ? { "x-csrf-token": D } : {}),
            },
            credentials: "include",
            body: JSON.stringify({ tokenId: r, reason: "Admin revocation" }),
          });
        if (!P.ok) throw new Error("Failed to revoke token");
        return P.json();
      },
      onSuccess: () => {
        (x({
          title: "Token revoked",
          description: "The token has been revoked successfully.",
        }),
          v(""));
      },
    });
  return e.jsxDEV(
    "div",
    {
      className: "space-y-6",
      children: [
        e.jsxDEV(
          n,
          {
            children: [
              e.jsxDEV(
                l,
                {
                  children: e.jsxDEV(
                    o,
                    {
                      className: "flex items-center",
                      children: [
                        e.jsxDEV(
                          Be,
                          { className: "h-5 w-5 mr-2" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1252,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        "Issue New Token",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1251,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                  lineNumber: 1250,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                m,
                {
                  children: e.jsxDEV(
                    "div",
                    {
                      className: "space-y-4",
                      children: [
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-sm text-gray-600",
                            children:
                              "Generate JWT access and refresh tokens for API access",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1258,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          j,
                          {
                            onClick: () => V(),
                            disabled: h,
                            "data-testid": "button-issue-token",
                            children: h
                              ? "Issuing..."
                              : "Issue Token for Current User",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1261,
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
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1257,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                  lineNumber: 1256,
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
              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
            lineNumber: 1249,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          n,
          {
            children: [
              e.jsxDEV(
                l,
                {
                  children: e.jsxDEV(
                    o,
                    {
                      className: "flex items-center",
                      children: [
                        e.jsxDEV(
                          He,
                          { className: "h-5 w-5 mr-2" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1275,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        "Revoke Token",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1274,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                  lineNumber: 1273,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                m,
                {
                  children: e.jsxDEV(
                    "div",
                    {
                      className: "space-y-4",
                      children: [
                        e.jsxDEV(
                          "input",
                          {
                            type: "text",
                            placeholder: "Token ID",
                            value: f,
                            onChange: (r) => v(r.target.value),
                            className: "w-full px-3 py-2 border rounded-md",
                            "data-testid": "input-revoke-token-id",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1281,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          j,
                          {
                            onClick: () => t(f),
                            disabled: !f || p,
                            variant: "destructive",
                            "data-testid": "button-revoke-token",
                            children: p ? "Revoking..." : "Revoke Token",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1289,
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
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1280,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                  lineNumber: 1279,
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
              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
            lineNumber: 1272,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    !0,
    {
      fileName: "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
      lineNumber: 1248,
      columnNumber: 5,
    },
    this,
  );
}
function os() {
  const { toast: x } = ue(),
    [E, C] = b.useState(""),
    { data: f, isLoading: v } = S({
      queryKey: ["/api/admin/webhooks/dead-letter"],
    }),
    { mutate: V, isPending: h } = J({
      mutationFn: async (t) => {
        const p = X(),
          r = await fetch(`/api/admin/webhooks/${t}/retry`, {
            method: "POST",
            credentials: "include",
            headers: p ? { "x-csrf-token": p } : {},
          });
        if (!r.ok) throw new Error("Failed to retry webhook");
        return r.json();
      },
      onSuccess: () => {
        x({
          title: "Retry initiated",
          description: "The webhook event has been queued for retry.",
        });
      },
    });
  return e.jsxDEV(
    "div",
    {
      className: "space-y-6",
      children: [
        e.jsxDEV(
          n,
          {
            children: [
              e.jsxDEV(
                l,
                {
                  children: e.jsxDEV(
                    o,
                    {
                      className: "flex items-center",
                      children: [
                        e.jsxDEV(
                          We,
                          { className: "h-5 w-5 mr-2" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1334,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        "Webhook Monitor",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1333,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                  lineNumber: 1332,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                m,
                {
                  children: e.jsxDEV(
                    "div",
                    {
                      className: "space-y-4",
                      children: e.jsxDEV(
                        "div",
                        {
                          className: "grid grid-cols-1 md:grid-cols-3 gap-4",
                          children: [
                            e.jsxDEV(
                              "div",
                              {
                                className: "p-4 bg-blue-50 rounded-lg",
                                children: [
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className:
                                        "text-sm text-blue-600 font-medium",
                                      children: "Dead Letter Queue",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 1342,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className:
                                        "text-2xl font-bold text-blue-900",
                                      "data-testid": "text-dlq-count",
                                      children: v
                                        ? "..."
                                        : f?.queue?.length || 0,
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 1343,
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
                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                lineNumber: 1341,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "p-4 bg-green-50 rounded-lg",
                                children: [
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className:
                                        "text-sm text-green-600 font-medium",
                                      children: "Successful",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 1348,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className:
                                        "text-2xl font-bold text-green-900",
                                      children: "N/A",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 1349,
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
                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                lineNumber: 1347,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "p-4 bg-red-50 rounded-lg",
                                children: [
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className:
                                        "text-sm text-red-600 font-medium",
                                      children: "Failed",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 1352,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className:
                                        "text-2xl font-bold text-red-900",
                                      children: "N/A",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 1353,
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
                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                lineNumber: 1351,
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
                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                          lineNumber: 1340,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1339,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                  lineNumber: 1338,
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
              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
            lineNumber: 1331,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          n,
          {
            children: [
              e.jsxDEV(
                l,
                {
                  children: e.jsxDEV(
                    o,
                    {
                      className: "flex items-center",
                      children: [
                        e.jsxDEV(
                          Qe,
                          { className: "h-5 w-5 mr-2" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1363,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        "Retry Webhook",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1362,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                  lineNumber: 1361,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                m,
                {
                  children: e.jsxDEV(
                    "div",
                    {
                      className: "space-y-4",
                      children: [
                        e.jsxDEV(
                          "input",
                          {
                            type: "text",
                            placeholder: "Attempt ID",
                            value: E,
                            onChange: (t) => C(t.target.value),
                            className: "w-full px-3 py-2 border rounded-md",
                            "data-testid": "input-webhook-attempt-id",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1369,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          j,
                          {
                            onClick: () => V(E),
                            disabled: !E || h,
                            "data-testid": "button-retry-webhook",
                            children: h ? "Retrying..." : "Retry Webhook",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1377,
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
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1368,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                  lineNumber: 1367,
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
              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
            lineNumber: 1360,
            columnNumber: 7,
          },
          this,
        ),
        f?.queue &&
          f.queue.length > 0 &&
          e.jsxDEV(
            n,
            {
              children: [
                e.jsxDEV(
                  l,
                  {
                    children: e.jsxDEV(
                      o,
                      { children: "Dead Letter Queue" },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                        lineNumber: 1391,
                        columnNumber: 13,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                    lineNumber: 1390,
                    columnNumber: 11,
                  },
                  this,
                ),
                e.jsxDEV(
                  m,
                  {
                    children: e.jsxDEV(
                      "div",
                      {
                        className: "space-y-2",
                        "data-testid": "list-dlq-items",
                        children: f.queue.map((t, p) =>
                          e.jsxDEV(
                            "div",
                            {
                              className: "p-3 bg-gray-50 rounded-lg",
                              "data-testid": `dlq-item-${p}`,
                              children: e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "flex justify-between items-center",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className: "text-sm font-medium",
                                              children: [
                                                "Event ID: ",
                                                t.webhookEventId,
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 1403,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-xs text-gray-600",
                                              children: [
                                                "Attempts: ",
                                                t.attempts,
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 1404,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className: "text-xs text-red-600",
                                              children: t.lastError,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                              lineNumber: 1405,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 1402,
                                        columnNumber: 21,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      w,
                                      {
                                        variant:
                                          t.status === "queued"
                                            ? "secondary"
                                            : "default",
                                        children: t.status,
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 1407,
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
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 1401,
                                  columnNumber: 19,
                                },
                                this,
                              ),
                            },
                            t.id,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                              lineNumber: 1396,
                              columnNumber: 17,
                            },
                            this,
                          ),
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                        lineNumber: 1394,
                        columnNumber: 13,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                    lineNumber: 1393,
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
                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
              lineNumber: 1389,
              columnNumber: 9,
            },
            this,
          ),
      ],
    },
    void 0,
    !0,
    {
      fileName: "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
      lineNumber: 1330,
      columnNumber: 5,
    },
    this,
  );
}
function ts() {
  const [x, E] = b.useState(""),
    [C, f] = b.useState(""),
    [v, V] = b.useState("100"),
    {
      data: h,
      isLoading: t,
      refetch: p,
    } = S({
      queryKey: ["/api/logs/query", { level: x, service: C, limit: v }],
      enabled: !1,
    });
  return e.jsxDEV(
    "div",
    {
      className: "space-y-6",
      children: [
        e.jsxDEV(
          n,
          {
            children: [
              e.jsxDEV(
                l,
                {
                  children: e.jsxDEV(
                    o,
                    {
                      className: "flex items-center",
                      children: [
                        e.jsxDEV(
                          ze,
                          { className: "h-5 w-5 mr-2" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1441,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        "Log Filters",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1440,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                  lineNumber: 1439,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                m,
                {
                  children: e.jsxDEV(
                    "div",
                    {
                      className: "grid grid-cols-1 md:grid-cols-4 gap-4",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            children: [
                              e.jsxDEV(
                                "label",
                                {
                                  className: "text-sm font-medium",
                                  children: "Level",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 1448,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "select",
                                {
                                  value: x,
                                  onChange: (r) => E(r.target.value),
                                  className:
                                    "w-full px-3 py-2 border rounded-md mt-1",
                                  "data-testid": "select-log-level",
                                  children: [
                                    e.jsxDEV(
                                      "option",
                                      { value: "", children: "All" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 1455,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "option",
                                      { value: "debug", children: "Debug" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 1456,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "option",
                                      { value: "info", children: "Info" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 1457,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "option",
                                      { value: "warn", children: "Warn" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 1458,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "option",
                                      { value: "error", children: "Error" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 1459,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "option",
                                      {
                                        value: "critical",
                                        children: "Critical",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                        lineNumber: 1460,
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
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 1449,
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
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1447,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            children: [
                              e.jsxDEV(
                                "label",
                                {
                                  className: "text-sm font-medium",
                                  children: "Service",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 1464,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "input",
                                {
                                  type: "text",
                                  placeholder: "Service name",
                                  value: C,
                                  onChange: (r) => f(r.target.value),
                                  className:
                                    "w-full px-3 py-2 border rounded-md mt-1",
                                  "data-testid": "input-log-service",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 1465,
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
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1463,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            children: [
                              e.jsxDEV(
                                "label",
                                {
                                  className: "text-sm font-medium",
                                  children: "Limit",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 1475,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "input",
                                {
                                  type: "number",
                                  value: v,
                                  onChange: (r) => V(r.target.value),
                                  className:
                                    "w-full px-3 py-2 border rounded-md mt-1",
                                  "data-testid": "input-log-limit",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                  lineNumber: 1476,
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
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1474,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-end",
                            children: e.jsxDEV(
                              j,
                              {
                                onClick: () => p(),
                                disabled: t,
                                className: "w-full",
                                "data-testid": "button-search-logs",
                                children: [
                                  e.jsxDEV(
                                    ce,
                                    { className: "h-4 w-4 mr-2" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 1491,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  t ? "Searching..." : "Search Logs",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                lineNumber: 1485,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                            lineNumber: 1484,
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
                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                      lineNumber: 1446,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                  lineNumber: 1445,
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
              "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
            lineNumber: 1438,
            columnNumber: 7,
          },
          this,
        ),
        h?.logs &&
          e.jsxDEV(
            n,
            {
              children: [
                e.jsxDEV(
                  l,
                  {
                    children: e.jsxDEV(
                      o,
                      {
                        className: "flex items-center",
                        children: [
                          e.jsxDEV(
                            te,
                            { className: "h-5 w-5 mr-2" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                              lineNumber: 1503,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          "Log Results (",
                          h.logs.length,
                          ")",
                        ],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                        lineNumber: 1502,
                        columnNumber: 13,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                    lineNumber: 1501,
                    columnNumber: 11,
                  },
                  this,
                ),
                e.jsxDEV(
                  m,
                  {
                    children: e.jsxDEV(
                      "div",
                      {
                        className: "space-y-2 max-h-96 overflow-y-auto",
                        "data-testid": "list-log-events",
                        children: h.logs.map((r, D) =>
                          e.jsxDEV(
                            "div",
                            {
                              className: `p-3 rounded-lg text-sm ${r.level === "error" || r.level === "critical" ? "bg-red-50 border-l-4 border-red-500" : r.level === "warn" ? "bg-yellow-50 border-l-4 border-yellow-500" : "bg-gray-50 border-l-4 border-gray-300"}`,
                              "data-testid": `log-event-${D}`,
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "flex justify-between items-start mb-1",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-center space-x-2",
                                          children: [
                                            e.jsxDEV(
                                              w,
                                              {
                                                variant: "outline",
                                                children: r.level,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 1523,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className: "font-medium",
                                                children: r.service,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                                lineNumber: 1524,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                          lineNumber: 1522,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "span",
                                        {
                                          className: "text-xs text-gray-500",
                                          children: new Date(
                                            r.timestamp,
                                          ).toLocaleString(),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                          lineNumber: 1526,
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
                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                    lineNumber: 1521,
                                    columnNumber: 19,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "p",
                                  {
                                    className: "text-gray-900",
                                    children: r.message,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                    lineNumber: 1530,
                                    columnNumber: 19,
                                  },
                                  this,
                                ),
                                r.context &&
                                  e.jsxDEV(
                                    "pre",
                                    {
                                      className:
                                        "mt-2 text-xs bg-white p-2 rounded overflow-x-auto",
                                      children: JSON.stringify(
                                        r.context,
                                        null,
                                        2,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                                      lineNumber: 1532,
                                      columnNumber: 21,
                                    },
                                    this,
                                  ),
                              ],
                            },
                            r.id,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                              lineNumber: 1510,
                              columnNumber: 17,
                            },
                            this,
                          ),
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                        lineNumber: 1508,
                        columnNumber: 13,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
                    lineNumber: 1507,
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
                "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
              lineNumber: 1500,
              columnNumber: 9,
            },
            this,
          ),
      ],
    },
    void 0,
    !0,
    {
      fileName: "/home/runner/workspace/client/src/pages/AdminDashboard.tsx",
      lineNumber: 1437,
      columnNumber: 5,
    },
    this,
  );
}
export { vs as default };
