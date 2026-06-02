import {
  ag as dr,
  r as c,
  aH as A,
  aI as f,
  f as e,
  ap as Q,
  cv as he,
  dw as Nr,
  dc as bs,
  bX as fs,
  dm as gs,
  b7 as hr,
  b5 as pr,
  fq as we,
  de as vs,
  bv as ws,
  fr as pe,
  cU as We,
  aO as xr,
  aQ as br,
  bw as se,
  bK as Ye,
  bc as fr,
  cZ as Xe,
  aR as gr,
  bJ as xe,
  a_ as be,
  bI as Je,
  aL as re,
  ao as Ze,
  b$ as R,
  cL as ne,
  bk as ie,
  d7 as es,
  e6 as vr,
  bB as wr,
  cw as ss,
  cY as kr,
  da as Ar,
  bg as Dr,
  aK as jr,
  c2 as Er,
  eq as Vr,
  eW as yr,
  bu as Sr,
} from "./vendor-react-31oK5L0i.js";
import { b as Cr } from "./useRequireAuth-K5x5riUd.js";
import {
  u as Rr,
  o as rs,
  p as ns,
  r as is,
  v as ls,
  w as ms,
  L as j,
  W as P,
  X as U,
  Y as T,
  Z as M,
  $ as t,
  ac as as,
  j as i,
  H as ts,
  K as cs,
  M as os,
  N as us,
  O as ds,
  Q as Ns,
  R as hs,
  U as ps,
  B as o,
  y as xs,
  q as y,
  a as g,
  C as l,
  h as m,
  d,
  f as N,
  a8 as F,
  P as O,
  g as L,
  I as S,
  S as Pr,
} from "./studio-DOUfHW5v.js";
import {
  T as fe,
  a as ge,
  b as z,
  c as h,
  d as ve,
  e as p,
} from "./table-BLAeU9Q6.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./index-D5xLbTBZ.js";
import "./vendor-animation-CFQslDag.js";
const Ur = [
  { id: "overview", label: "Overview", icon: Nr },
  { id: "users", label: "User Management", icon: bs },
  { id: "moderation", label: "Content Moderation", icon: fs },
  { id: "system", label: "System Health", icon: gs },
  { id: "analytics", label: "Platform Analytics", icon: hr },
  { id: "financial", label: "Financial Config", icon: pr },
  { id: "killswitch", label: "Kill Switch", icon: we },
  { id: "payment-bypass", label: "Payment Bypass", icon: vs },
  { id: "settings", label: "Settings", icon: ws },
];
function $r() {
  const { user: E, isLoading: ks } = Cr(),
    [, H] = dr(),
    { toast: u } = Rr(),
    [ke, Ae] = c.useState("overview"),
    [De, As] = c.useState(""),
    [je, Ds] = c.useState("all"),
    [Ee, js] = c.useState("all"),
    [Ve, Es] = c.useState("pending"),
    [Vs, _] = c.useState(!1),
    [ys, le] = c.useState(!1),
    [Ss, G] = c.useState(!1),
    [Cs, W] = c.useState(!1),
    [V, Y] = c.useState(null),
    [C, ye] = c.useState(null),
    [Se, Ce] = c.useState("user"),
    [Re, Pe] = c.useState("free"),
    [Ue, Te] = c.useState("active"),
    [X, Me] = c.useState(""),
    [Fe, Le] = c.useState(""),
    [$, Ke] = c.useState(""),
    [Tr, Be] = c.useState("all"),
    [J, Rs] = c.useState("2"),
    [qe, Ie] = c.useState(""),
    [me, Ps] = c.useState("1"),
    {
      data: K,
      isLoading: Us,
      refetch: Mr,
    } = A({
      queryKey: ["/api/admin/users", { search: De, status: je, plan: Ee }],
      enabled: !!E,
    }),
    { data: b, isLoading: Ts } = A({
      queryKey: ["/api/admin/analytics"],
      enabled: !!E,
    }),
    {
      data: n,
      isLoading: Oe,
      refetch: ae,
    } = A({
      queryKey: ["/api/admin/system-health"],
      enabled: !!E,
      refetchInterval: 3e4,
    }),
    {
      data: D,
      isError: Ms,
      refetch: Fs,
    } = A({
      queryKey: ["/api/dns/resolver/status"],
      enabled: !!E,
      refetchInterval: 6e4,
      retry: 1,
      queryFn: async () => {
        const s = await fetch("/api/dns/resolver/status", {
          credentials: "include",
        });
        return s.ok
          ? s.json()
          : {
              ok: !1,
              error:
                (await s.json().catch(() => ({}))).error ||
                "Resolver unavailable",
            };
      },
    }),
    {
      data: B,
      isLoading: ze,
      refetch: Ls,
    } = A({
      queryKey: ["/api/admin/moderation/reports", { status: Ve }],
      enabled: !!E,
    }),
    { data: q } = A({ queryKey: ["/api/admin/settings"], enabled: !!E }),
    {
      data: x,
      isLoading: Ks,
      refetch: te,
    } = A({
      queryKey: ["/api/admin/payment-bypass/status"],
      enabled: !!E,
      refetchInterval: 3e4,
    }),
    ce = f({
      mutationFn: async ({
        userId: s,
        role: a,
        subscriptionTier: v,
        subscriptionStatus: w,
      }) =>
        (
          await g("PUT", `/api/admin/users/${s}`, {
            role: a,
            subscriptionTier: v,
            subscriptionStatus: w,
          })
        ).json(),
      onSuccess: () => {
        (y.invalidateQueries({ queryKey: ["/api/admin/users"] }),
          _(!1),
          Y(null),
          u({
            title: "User Updated",
            description: "User details have been updated successfully.",
          }));
      },
      onError: (s) => {
        u({
          title: "Update Failed",
          description: s.message,
          variant: "destructive",
        });
      },
    }),
    Bs = f({
      mutationFn: async ({ userId: s, reason: a }) =>
        (
          await g("POST", `/api/admin/users/${s}/suspend`, { reason: a })
        ).json(),
      onSuccess: () => {
        (y.invalidateQueries({ queryKey: ["/api/admin/users"] }),
          u({
            title: "User Suspended",
            description: "User has been suspended successfully.",
          }));
      },
    }),
    qs = f({
      mutationFn: async (s) =>
        (await g("POST", `/api/admin/users/${s}/reactivate`)).json(),
      onSuccess: () => {
        (y.invalidateQueries({ queryKey: ["/api/admin/users"] }),
          u({
            title: "User Reactivated",
            description: "User has been reactivated successfully.",
          }));
      },
    }),
    Is = f({
      mutationFn: async (s) =>
        (await g("DELETE", `/api/admin/users/${s}`)).json(),
      onSuccess: () => {
        (y.invalidateQueries({ queryKey: ["/api/admin/users"] }),
          le(!1),
          Y(null),
          u({
            title: "User Deleted",
            description: "User has been deleted from the platform.",
          }));
      },
    }),
    oe = f({
      mutationFn: async ({ reportId: s, action: a, notes: v }) =>
        (
          await g("POST", `/api/admin/moderation/reports/${s}/review`, {
            action: a,
            notes: v,
          })
        ).json(),
      onSuccess: () => {
        (y.invalidateQueries({ queryKey: ["/api/admin/moderation/reports"] }),
          G(!1),
          ye(null),
          Me(""),
          Le(""),
          u({
            title: "Report Reviewed",
            description: "The moderation report has been processed.",
          }));
      },
    }),
    Os = f({
      mutationFn: async (s) =>
        (await g("POST", "/api/kill-switch/kill-all", { reason: s })).json(),
      onSuccess: () => {
        (ae(),
          W(!1),
          Ke(""),
          u({
            title: "Emergency Stop Activated",
            description: "All autonomous systems have been stopped.",
            variant: "destructive",
          }));
      },
    }),
    zs = f({
      mutationFn: async (s) =>
        (await g("POST", "/api/kill-switch/resume-all", { reason: s })).json(),
      onSuccess: () => {
        (ae(),
          u({
            title: "Systems Resumed",
            description: "All autonomous systems have been resumed.",
          }));
      },
    }),
    ue = f({
      mutationFn: async ({ durationHours: s, reason: a }) =>
        (
          await g("POST", "/api/admin/payment-bypass/activate", {
            durationHours: s,
            reason: a,
          })
        ).json(),
      onSuccess: () => {
        (y.invalidateQueries({
          queryKey: ["/api/admin/payment-bypass/status"],
        }),
          te(),
          Ie(""),
          u({
            title: "Payment Bypass Activated",
            description: `Payment requirements bypassed for ${J} hours.`,
          }));
      },
      onError: (s) => {
        u({
          title: "Activation Failed",
          description: s.message,
          variant: "destructive",
        });
      },
    }),
    de = f({
      mutationFn: async () =>
        (await g("POST", "/api/admin/payment-bypass/deactivate", {})).json(),
      onSuccess: () => {
        (y.invalidateQueries({
          queryKey: ["/api/admin/payment-bypass/status"],
        }),
          te(),
          u({
            title: "Payment Bypass Deactivated",
            description: "Payment requirements are back in effect.",
          }));
      },
      onError: (s) => {
        u({
          title: "Deactivation Failed",
          description: s.message,
          variant: "destructive",
        });
      },
    }),
    Ne = f({
      mutationFn: async (s) =>
        (
          await g("POST", "/api/admin/payment-bypass/extend", {
            additionalHours: s,
          })
        ).json(),
      onSuccess: () => {
        (y.invalidateQueries({
          queryKey: ["/api/admin/payment-bypass/status"],
        }),
          te(),
          u({
            title: "Bypass Extended",
            description: `Extended by ${me} hour(s).`,
          }));
      },
      onError: (s) => {
        u({
          title: "Extension Failed",
          description: s.message,
          variant: "destructive",
        });
      },
    }),
    He = f({
      mutationFn: async () =>
        (await g("GET", "/api/admin/users/export")).json(),
      onSuccess: (s) => {
        const a = new Blob([JSON.stringify(s, null, 2)], {
            type: "application/json",
          }),
          v = URL.createObjectURL(a),
          w = document.createElement("a");
        ((w.href = v),
          (w.download = `users-export-${new Date().toISOString()}.json`),
          document.body.appendChild(w),
          w.click(),
          document.body.removeChild(w),
          URL.revokeObjectURL(v),
          u({
            title: "Export Successful",
            description: "User data has been exported.",
          }));
      },
    });
  if (ks)
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
                Q,
                { className: "w-8 h-8 animate-spin text-primary" },
                void 0,
                !1,
                {
                  fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                  lineNumber: 444,
                  columnNumber: 11,
                },
                this,
              ),
              e.jsxDEV(
                "p",
                {
                  className: "text-muted-foreground",
                  children: "Loading admin panel…",
                },
                void 0,
                !1,
                {
                  fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                  lineNumber: 445,
                  columnNumber: 11,
                },
                this,
              ),
            ],
          },
          void 0,
          !0,
          {
            fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
            lineNumber: 443,
            columnNumber: 9,
          },
          this,
        ),
      },
      void 0,
      !1,
      {
        fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
        lineNumber: 442,
        columnNumber: 7,
      },
      this,
    );
  if (!E) return null;
  const $e = K?.users || [],
    Qe = B?.reports || [],
    Hs = (s) => {
      switch (s) {
        case "active":
          return "bg-green-100 text-green-800";
        case "inactive":
          return "bg-gray-100 text-gray-800";
        case "cancelled":
          return "bg-red-100 text-red-800";
        case "suspended":
        case "banned":
          return "bg-red-200 text-red-900";
        case "past_due":
          return "bg-yellow-100 text-yellow-800";
        default:
          return "bg-gray-100 text-gray-800";
      }
    },
    $s = (s) => {
      switch (s) {
        case "operational":
          return "text-green-600";
        case "degraded":
          return "text-yellow-600";
        case "down":
          return "text-red-600";
        default:
          return "text-gray-600";
      }
    },
    Qs = (s) => {
      switch (s) {
        case "operational":
          return e.jsxDEV(
            R,
            { className: "h-4 w-4 text-green-600" },
            void 0,
            !1,
            {
              fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
              lineNumber: 479,
              columnNumber: 34,
            },
            this,
          );
        case "degraded":
          return e.jsxDEV(
            se,
            { className: "h-4 w-4 text-yellow-600" },
            void 0,
            !1,
            {
              fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
              lineNumber: 480,
              columnNumber: 31,
            },
            this,
          );
        case "down":
          return e.jsxDEV(
            ne,
            { className: "h-4 w-4 text-red-600" },
            void 0,
            !1,
            {
              fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
              lineNumber: 481,
              columnNumber: 27,
            },
            this,
          );
        default:
          return e.jsxDEV(
            Ze,
            { className: "h-4 w-4 text-gray-600" },
            void 0,
            !1,
            {
              fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
              lineNumber: 482,
              columnNumber: 23,
            },
            this,
          );
      }
    },
    _s = () =>
      e.jsxDEV(
        "div",
        {
          className:
            "w-64 bg-gray-900 text-white min-h-screen p-4 flex-shrink-0",
          children: [
            e.jsxDEV(
              "div",
              {
                className: "mb-8",
                children: [
                  e.jsxDEV(
                    "h2",
                    {
                      className: "text-xl font-bold flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          he,
                          { className: "h-6 w-6 text-blue-400" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 490,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        "Admin Panel",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 489,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "p",
                    {
                      className: "text-gray-400 text-sm mt-1",
                      children: "Max Booster Control Center",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 493,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 488,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              "nav",
              {
                className: "space-y-1",
                children: Ur.map((s) =>
                  e.jsxDEV(
                    "button",
                    {
                      onClick: () => Ae(s.id),
                      className: `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${ke === s.id ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"}`,
                      children: [
                        e.jsxDEV(
                          s.icon,
                          { className: "h-5 w-5" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 506,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "span",
                          {
                            className: "text-sm font-medium",
                            children: s.label,
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 507,
                            columnNumber: 13,
                          },
                          this,
                        ),
                      ],
                    },
                    s.id,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 497,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ),
              },
              void 0,
              !1,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 495,
                columnNumber: 7,
              },
              this,
            ),
            n?.killSwitch?.globalKilled &&
              e.jsxDEV(
                "div",
                {
                  className:
                    "mt-8 p-3 bg-red-900/50 border border-red-700 rounded-lg",
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className: "flex items-center gap-2 text-red-400",
                        children: [
                          e.jsxDEV(
                            pe,
                            { className: "h-4 w-4" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                              lineNumber: 514,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "span",
                            {
                              className: "text-sm font-medium",
                              children: "Kill Switch Active",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                              lineNumber: 515,
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
                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                        lineNumber: 513,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "p",
                      {
                        className: "text-xs text-red-300 mt-1",
                        children: "All systems are paused",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                        lineNumber: 517,
                        columnNumber: 11,
                      },
                      this,
                    ),
                  ],
                },
                void 0,
                !0,
                {
                  fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                  lineNumber: 512,
                  columnNumber: 9,
                },
                this,
              ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
          lineNumber: 487,
          columnNumber: 5,
        },
        this,
      ),
    _e = () =>
      e.jsxDEV(
        "div",
        {
          className: "space-y-6",
          children: [
            e.jsxDEV(
              "div",
              {
                className:
                  "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4",
                children: [
                  e.jsxDEV(
                    l,
                    {
                      className:
                        "bg-gradient-to-br from-blue-500 to-blue-600 text-white",
                      children: e.jsxDEV(
                        m,
                        {
                          className: "p-6",
                          children: e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center justify-between",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    children: [
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-blue-100 text-sm",
                                          children: "Total Users",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 530,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-3xl font-bold",
                                          children:
                                            b?.totalUsers?.toLocaleString() ||
                                            "0",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 531,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-blue-200 text-sm",
                                          children: [
                                            "+",
                                            b?.recentSignups || 0,
                                            " this month",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 532,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 529,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  bs,
                                  { className: "h-12 w-12 text-blue-200" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 534,
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
                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                              lineNumber: 528,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 527,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 526,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    l,
                    {
                      className:
                        "bg-gradient-to-br from-green-500 to-green-600 text-white",
                      children: e.jsxDEV(
                        m,
                        {
                          className: "p-6",
                          children: e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center justify-between",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    children: [
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-green-100 text-sm",
                                          children: "Total Revenue",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 542,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-3xl font-bold",
                                          children: [
                                            "$",
                                            b?.totalRevenue?.toLocaleString() ||
                                              "0",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 543,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-green-200 text-sm",
                                          children: [
                                            "+",
                                            b?.revenueGrowth || 0,
                                            "% growth",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 544,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 541,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  We,
                                  { className: "h-12 w-12 text-green-200" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 546,
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
                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                              lineNumber: 540,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 539,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 538,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    l,
                    {
                      className:
                        "bg-gradient-to-br from-purple-500 to-purple-600 text-white",
                      children: e.jsxDEV(
                        m,
                        {
                          className: "p-6",
                          children: e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center justify-between",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    children: [
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-purple-100 text-sm",
                                          children: "Total Projects",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 554,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-3xl font-bold",
                                          children:
                                            b?.totalProjects?.toLocaleString() ||
                                            "0",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 555,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-purple-200 text-sm",
                                          children: [
                                            "+",
                                            b?.projectsGrowth || 0,
                                            "% growth",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 556,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 553,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  xr,
                                  { className: "h-12 w-12 text-purple-200" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 558,
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
                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                              lineNumber: 552,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 551,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 550,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    l,
                    {
                      className:
                        "bg-gradient-to-br from-orange-500 to-orange-600 text-white",
                      children: e.jsxDEV(
                        m,
                        {
                          className: "p-6",
                          children: e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center justify-between",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    children: [
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-orange-100 text-sm",
                                          children: "System Uptime",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 566,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-3xl font-bold",
                                          children:
                                            n?.server?.uptimeFormatted || "N/A",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 567,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-orange-200 text-sm",
                                          children: n?.server?.uptime
                                            ? "Since last restart"
                                            : "Checking...",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 568,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 565,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  br,
                                  { className: "h-12 w-12 text-orange-200" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 570,
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
                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                              lineNumber: 564,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 563,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 562,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 525,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                className: "grid grid-cols-1 lg:grid-cols-2 gap-6",
                children: [
                  e.jsxDEV(
                    l,
                    {
                      children: [
                        e.jsxDEV(
                          d,
                          {
                            children: e.jsxDEV(
                              N,
                              {
                                className: "flex items-center gap-2",
                                children: [
                                  e.jsxDEV(
                                    gs,
                                    { className: "h-5 w-5" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 579,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  "Quick System Status",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 578,
                                columnNumber: 13,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 577,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          m,
                          {
                            children: Oe
                              ? e.jsxDEV(
                                  F,
                                  { className: "h-32" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 585,
                                    columnNumber: 15,
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
                                              "span",
                                              {
                                                className: "text-sm",
                                                children: "Database",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 589,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              o,
                                              {
                                                variant:
                                                  n?.database?.status ===
                                                  "connected"
                                                    ? "default"
                                                    : "destructive",
                                                children:
                                                  n?.database?.status ||
                                                  "Unknown",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 590,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 588,
                                          columnNumber: 17,
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
                                              "span",
                                              {
                                                className: "text-sm",
                                                children: "CPU Usage",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 595,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "text-sm font-medium",
                                                children: [
                                                  n?.server?.cpu || 0,
                                                  "%",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 596,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 594,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        O,
                                        {
                                          value: n?.server?.cpu || 0,
                                          className: "h-2",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 598,
                                          columnNumber: 17,
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
                                              "span",
                                              {
                                                className: "text-sm",
                                                children: "Memory Usage",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 600,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "text-sm font-medium",
                                                children: [
                                                  n?.server?.memory
                                                    ?.percentUsed || 0,
                                                  "%",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 601,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 599,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        O,
                                        {
                                          value:
                                            n?.server?.memory?.percentUsed || 0,
                                          className: "h-2",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 603,
                                          columnNumber: 17,
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
                                              "span",
                                              {
                                                className: "text-sm",
                                                children: "Error Rate (24h)",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 605,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              o,
                                              {
                                                variant: "outline",
                                                children:
                                                  n?.errorTracking?.errorRate ||
                                                  "0%",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 606,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 604,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 587,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 583,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 576,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    l,
                    {
                      children: [
                        e.jsxDEV(
                          d,
                          {
                            children: e.jsxDEV(
                              N,
                              {
                                className: "flex items-center gap-2",
                                children: [
                                  e.jsxDEV(
                                    fs,
                                    { className: "h-5 w-5" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 615,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  "Moderation Queue",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 614,
                                columnNumber: 13,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 613,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          m,
                          {
                            children: ze
                              ? e.jsxDEV(
                                  F,
                                  { className: "h-32" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 621,
                                    columnNumber: 15,
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
                                            "flex items-center justify-between p-3 bg-yellow-50 rounded-lg",
                                          children: [
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex items-center gap-2",
                                                children: [
                                                  e.jsxDEV(
                                                    se,
                                                    {
                                                      className:
                                                        "h-5 w-5 text-yellow-600",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 626,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "span",
                                                    {
                                                      className: "font-medium",
                                                      children:
                                                        "Pending Reports",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 627,
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
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 625,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              o,
                                              {
                                                variant: "outline",
                                                className: "bg-yellow-100",
                                                children:
                                                  B?.stats?.pending || 0,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 629,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 624,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-center justify-between p-3 bg-blue-50 rounded-lg",
                                          children: [
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex items-center gap-2",
                                                children: [
                                                  e.jsxDEV(
                                                    Ye,
                                                    {
                                                      className:
                                                        "h-5 w-5 text-blue-600",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 635,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "span",
                                                    {
                                                      className: "font-medium",
                                                      children:
                                                        "Reviewed Today",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 636,
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
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 634,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              o,
                                              {
                                                variant: "outline",
                                                className: "bg-blue-100",
                                                children:
                                                  B?.stats?.reviewed || 0,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 638,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 633,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        i,
                                        {
                                          variant: "outline",
                                          className: "w-full",
                                          onClick: () => Ae("moderation"),
                                          children: "View All Reports",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 642,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 623,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 619,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 612,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 575,
                columnNumber: 7,
              },
              this,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
          lineNumber: 524,
          columnNumber: 5,
        },
        this,
      ),
    Gs = () =>
      e.jsxDEV(
        "div",
        {
          className: "space-y-6",
          children: [
            e.jsxDEV(
              "div",
              {
                className:
                  "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4",
                children: [
                  e.jsxDEV(
                    "div",
                    {
                      children: [
                        e.jsxDEV(
                          "h2",
                          {
                            className: "text-2xl font-bold",
                            children: "User Management",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 661,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-gray-500",
                            children: "Manage platform users and subscriptions",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 662,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 660,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    i,
                    {
                      onClick: () => He.mutate(),
                      disabled: He.isPending,
                      children: [
                        e.jsxDEV(
                          Dr,
                          { className: "h-4 w-4 mr-2" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 665,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        "Export Users",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 664,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 659,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              l,
              {
                children: [
                  e.jsxDEV(
                    d,
                    {
                      children: e.jsxDEV(
                        "div",
                        {
                          className: "flex flex-col sm:flex-row gap-4",
                          children: [
                            e.jsxDEV(
                              "div",
                              {
                                className: "relative flex-1",
                                children: [
                                  e.jsxDEV(
                                    jr,
                                    {
                                      className:
                                        "absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 673,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    S,
                                    {
                                      placeholder: "Search users...",
                                      value: De,
                                      onChange: (s) => As(s.target.value),
                                      className: "pl-10",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 674,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 672,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              P,
                              {
                                value: je,
                                onValueChange: Ds,
                                children: [
                                  e.jsxDEV(
                                    U,
                                    {
                                      className: "w-40",
                                      children: e.jsxDEV(
                                        T,
                                        { placeholder: "Status" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 683,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 682,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    M,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          t,
                                          {
                                            value: "all",
                                            children: "All Status",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 686,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          t,
                                          {
                                            value: "active",
                                            children: "Active",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 687,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          t,
                                          {
                                            value: "inactive",
                                            children: "Inactive",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 688,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          t,
                                          {
                                            value: "suspended",
                                            children: "Suspended",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 689,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          t,
                                          {
                                            value: "banned",
                                            children: "Banned",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 690,
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
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 685,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 681,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              P,
                              {
                                value: Ee,
                                onValueChange: js,
                                children: [
                                  e.jsxDEV(
                                    U,
                                    {
                                      className: "w-40",
                                      children: e.jsxDEV(
                                        T,
                                        { placeholder: "Plan" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 695,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 694,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    M,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          t,
                                          {
                                            value: "all",
                                            children: "All Plans",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 698,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          t,
                                          { value: "free", children: "Free" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 699,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          t,
                                          {
                                            value: "monthly",
                                            children: "Monthly",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 700,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          t,
                                          {
                                            value: "yearly",
                                            children: "Yearly",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 701,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          t,
                                          {
                                            value: "lifetime",
                                            children: "Lifetime",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 702,
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
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 697,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 693,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 671,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 670,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    m,
                    {
                      children: [
                        Us
                          ? e.jsxDEV(
                              F,
                              { className: "h-64" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 709,
                                columnNumber: 13,
                              },
                              this,
                            )
                          : e.jsxDEV(
                              Pr,
                              {
                                className: "h-[500px]",
                                children: e.jsxDEV(
                                  fe,
                                  {
                                    children: [
                                      e.jsxDEV(
                                        ge,
                                        {
                                          children: e.jsxDEV(
                                            z,
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  h,
                                                  { children: "User" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 715,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  h,
                                                  { children: "Role" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 716,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  h,
                                                  { children: "Plan" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 717,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  h,
                                                  { children: "Status" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 718,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  h,
                                                  { children: "Joined" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 719,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  h,
                                                  {
                                                    className: "text-right",
                                                    children: "Actions",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 720,
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
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 714,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 713,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        ve,
                                        {
                                          children: $e.map((s) =>
                                            e.jsxDEV(
                                              z,
                                              {
                                                children: [
                                                  e.jsxDEV(
                                                    p,
                                                    {
                                                      children: e.jsxDEV(
                                                        "div",
                                                        {
                                                          children: [
                                                            e.jsxDEV(
                                                              "p",
                                                              {
                                                                className:
                                                                  "font-medium",
                                                                children:
                                                                  s.username ||
                                                                  "N/A",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                lineNumber: 728,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              "p",
                                                              {
                                                                className:
                                                                  "text-sm text-gray-500",
                                                                children:
                                                                  s.email,
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                lineNumber: 729,
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
                                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                          lineNumber: 727,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 726,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    p,
                                                    {
                                                      children: e.jsxDEV(
                                                        o,
                                                        {
                                                          variant:
                                                            s.role === "admin"
                                                              ? "default"
                                                              : "secondary",
                                                          children: [
                                                            s.role ===
                                                              "admin" &&
                                                              e.jsxDEV(
                                                                Er,
                                                                {
                                                                  className:
                                                                    "h-3 w-3 mr-1",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                  lineNumber: 734,
                                                                  columnNumber: 50,
                                                                },
                                                                this,
                                                              ),
                                                            s.role || "user",
                                                          ],
                                                        },
                                                        void 0,
                                                        !0,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                          lineNumber: 733,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 732,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    p,
                                                    {
                                                      children: e.jsxDEV(
                                                        o,
                                                        {
                                                          variant: "outline",
                                                          children:
                                                            s.subscriptionTier ||
                                                            "free",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                          lineNumber: 739,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 738,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    p,
                                                    {
                                                      children: e.jsxDEV(
                                                        o,
                                                        {
                                                          className: Hs(
                                                            s.subscriptionStatus ||
                                                              "inactive",
                                                          ),
                                                          children:
                                                            s.subscriptionStatus ||
                                                            "inactive",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                          lineNumber: 742,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 741,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    p,
                                                    {
                                                      children: s.createdAt
                                                        ? new Date(
                                                            s.createdAt,
                                                          ).toLocaleDateString()
                                                        : "N/A",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 746,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    p,
                                                    {
                                                      className: "text-right",
                                                      children: e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "flex justify-end gap-1",
                                                          children: [
                                                            e.jsxDEV(
                                                              i,
                                                              {
                                                                variant:
                                                                  "ghost",
                                                                size: "icon",
                                                                onClick: () => {
                                                                  (Y(s),
                                                                    Ce(
                                                                      s.role ||
                                                                        "user",
                                                                    ),
                                                                    Pe(
                                                                      s.subscriptionTier ||
                                                                        "free",
                                                                    ),
                                                                    Te(
                                                                      s.subscriptionStatus ||
                                                                        "active",
                                                                    ),
                                                                    _(!0));
                                                                },
                                                                children:
                                                                  e.jsxDEV(
                                                                    es,
                                                                    {
                                                                      className:
                                                                        "h-4 w-4",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                      lineNumber: 762,
                                                                      columnNumber: 29,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                lineNumber: 751,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            ),
                                                            s.subscriptionStatus ===
                                                              "suspended" ||
                                                            s.isSuspended
                                                              ? e.jsxDEV(
                                                                  i,
                                                                  {
                                                                    variant:
                                                                      "ghost",
                                                                    size: "icon",
                                                                    onClick:
                                                                      () =>
                                                                        qs.mutate(
                                                                          s.id,
                                                                        ),
                                                                    children:
                                                                      e.jsxDEV(
                                                                        Vr,
                                                                        {
                                                                          className:
                                                                            "h-4 w-4 text-green-600",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                          lineNumber: 770,
                                                                          columnNumber: 31,
                                                                        },
                                                                        this,
                                                                      ),
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                    lineNumber: 765,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                )
                                                              : e.jsxDEV(
                                                                  i,
                                                                  {
                                                                    variant:
                                                                      "ghost",
                                                                    size: "icon",
                                                                    onClick:
                                                                      () =>
                                                                        Bs.mutate(
                                                                          {
                                                                            userId:
                                                                              s.id,
                                                                          },
                                                                        ),
                                                                    children:
                                                                      e.jsxDEV(
                                                                        yr,
                                                                        {
                                                                          className:
                                                                            "h-4 w-4 text-yellow-600",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                          lineNumber: 778,
                                                                          columnNumber: 31,
                                                                        },
                                                                        this,
                                                                      ),
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                    lineNumber: 773,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                            e.jsxDEV(
                                                              i,
                                                              {
                                                                variant:
                                                                  "ghost",
                                                                size: "icon",
                                                                onClick: () => {
                                                                  (Y(s),
                                                                    le(!0));
                                                                },
                                                                children:
                                                                  e.jsxDEV(
                                                                    Sr,
                                                                    {
                                                                      className:
                                                                        "h-4 w-4 text-red-600",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                      lineNumber: 789,
                                                                      columnNumber: 29,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                lineNumber: 781,
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
                                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                          lineNumber: 750,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 749,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                ],
                                              },
                                              s.id,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 725,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 723,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 712,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 711,
                                columnNumber: 13,
                              },
                              this,
                            ),
                        K?.pagination &&
                          e.jsxDEV(
                            "div",
                            {
                              className:
                                "flex items-center justify-between mt-4",
                              children: [
                                e.jsxDEV(
                                  "p",
                                  {
                                    className: "text-sm text-gray-500",
                                    children: [
                                      "Showing ",
                                      $e.length,
                                      " of ",
                                      K.pagination.total,
                                      " users",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 801,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex gap-2",
                                    children: [
                                      e.jsxDEV(
                                        i,
                                        {
                                          variant: "outline",
                                          size: "sm",
                                          disabled: K.pagination.page <= 1,
                                          children: "Previous",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 805,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        i,
                                        {
                                          variant: "outline",
                                          size: "sm",
                                          disabled:
                                            K.pagination.page >=
                                            K.pagination.totalPages,
                                          children: "Next",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 808,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 804,
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
                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                              lineNumber: 800,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 707,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 669,
                columnNumber: 7,
              },
              this,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
          lineNumber: 658,
          columnNumber: 5,
        },
        this,
      ),
    Ws = () =>
      e.jsxDEV(
        "div",
        {
          className: "space-y-6",
          children: [
            e.jsxDEV(
              "div",
              {
                className:
                  "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4",
                children: [
                  e.jsxDEV(
                    "div",
                    {
                      children: [
                        e.jsxDEV(
                          "h2",
                          {
                            className: "text-2xl font-bold",
                            children: "Content Moderation",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 827,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-gray-500",
                            children: "Review and manage reported content",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 828,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 826,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "flex gap-2",
                      children: [
                        e.jsxDEV(
                          P,
                          {
                            value: Ve,
                            onValueChange: Es,
                            children: [
                              e.jsxDEV(
                                U,
                                {
                                  className: "w-40",
                                  children: e.jsxDEV(
                                    T,
                                    { placeholder: "Filter" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 833,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 832,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                M,
                                {
                                  children: [
                                    e.jsxDEV(
                                      t,
                                      { value: "all", children: "All Reports" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 836,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      t,
                                      { value: "pending", children: "Pending" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 837,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      t,
                                      {
                                        value: "reviewed",
                                        children: "Reviewed",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 838,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      t,
                                      {
                                        value: "resolved",
                                        children: "Resolved",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 839,
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
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 835,
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
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 831,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          i,
                          {
                            variant: "outline",
                            onClick: () => Ls(),
                            children: [
                              e.jsxDEV(
                                re,
                                { className: "h-4 w-4 mr-2" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 843,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              "Refresh",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 842,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 830,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 825,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                className: "grid grid-cols-1 md:grid-cols-3 gap-4",
                children: [
                  e.jsxDEV(
                    l,
                    {
                      className: "bg-yellow-50 border-yellow-200",
                      children: e.jsxDEV(
                        m,
                        {
                          className: "p-4 flex items-center justify-between",
                          children: [
                            e.jsxDEV(
                              "div",
                              {
                                children: [
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className: "text-yellow-800 font-medium",
                                      children: "Pending",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 852,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className:
                                        "text-2xl font-bold text-yellow-900",
                                      children: B?.stats?.pending || 0,
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 853,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 851,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              se,
                              { className: "h-8 w-8 text-yellow-600" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 855,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 850,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 849,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    l,
                    {
                      className: "bg-blue-50 border-blue-200",
                      children: e.jsxDEV(
                        m,
                        {
                          className: "p-4 flex items-center justify-between",
                          children: [
                            e.jsxDEV(
                              "div",
                              {
                                children: [
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className: "text-blue-800 font-medium",
                                      children: "Reviewed",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 861,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className:
                                        "text-2xl font-bold text-blue-900",
                                      children: B?.stats?.reviewed || 0,
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 862,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 860,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              Ye,
                              { className: "h-8 w-8 text-blue-600" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 864,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 859,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 858,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    l,
                    {
                      className: "bg-green-50 border-green-200",
                      children: e.jsxDEV(
                        m,
                        {
                          className: "p-4 flex items-center justify-between",
                          children: [
                            e.jsxDEV(
                              "div",
                              {
                                children: [
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className: "text-green-800 font-medium",
                                      children: "Resolved",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 870,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className:
                                        "text-2xl font-bold text-green-900",
                                      children: B?.stats?.resolved || 0,
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 871,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 869,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              R,
                              { className: "h-8 w-8 text-green-600" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 873,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 868,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 867,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 848,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              l,
              {
                children: [
                  e.jsxDEV(
                    d,
                    {
                      children: e.jsxDEV(
                        N,
                        { children: "Reported Content Queue" },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 879,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 878,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    m,
                    {
                      children: ze
                        ? e.jsxDEV(
                            F,
                            { className: "h-64" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                              lineNumber: 883,
                              columnNumber: 13,
                            },
                            this,
                          )
                        : Qe.length > 0
                          ? e.jsxDEV(
                              "div",
                              {
                                className: "space-y-4",
                                children: Qe.map((s) =>
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className:
                                        "p-4 border rounded-lg hover:bg-gray-50 transition-colors",
                                      children: e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-start justify-between",
                                          children: [
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className: "flex-1",
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex items-center gap-2 mb-2",
                                                      children: [
                                                        e.jsxDEV(
                                                          o,
                                                          {
                                                            variant: "outline",
                                                            children:
                                                              s.contentType,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 894,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          o,
                                                          {
                                                            variant:
                                                              s.status ===
                                                              "pending"
                                                                ? "destructive"
                                                                : "default",
                                                            children: s.status,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 895,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          o,
                                                          {
                                                            variant:
                                                              "secondary",
                                                            children:
                                                              s.reason.replace(
                                                                "_",
                                                                " ",
                                                              ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 898,
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
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 893,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "h4",
                                                    {
                                                      className: "font-medium",
                                                      children: s.contentTitle,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 900,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "p",
                                                    {
                                                      className:
                                                        "text-sm text-gray-600 mt-1",
                                                      children: s.description,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 901,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex items-center gap-4 mt-2 text-sm text-gray-500",
                                                      children: [
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            children: [
                                                              "Reported by: ",
                                                              s.reportedByUsername,
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 903,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            children: [
                                                              "Target: ",
                                                              s.targetUsername,
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 904,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            children: new Date(
                                                              s.createdAt,
                                                            ).toLocaleDateString(),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 905,
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
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 902,
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
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 892,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              i,
                                              {
                                                variant: "outline",
                                                onClick: () => {
                                                  (ye(s), G(!0));
                                                },
                                                children: "Review",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 908,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 891,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                    },
                                    s.id,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 887,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 885,
                                columnNumber: 13,
                              },
                              this,
                            )
                          : e.jsxDEV(
                              "div",
                              {
                                className: "text-center py-12",
                                children: [
                                  e.jsxDEV(
                                    R,
                                    {
                                      className:
                                        "h-12 w-12 text-green-500 mx-auto mb-4",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 923,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className: "text-gray-600",
                                      children: "No pending reports",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 924,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 922,
                                columnNumber: 13,
                              },
                              this,
                            ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 881,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 877,
                columnNumber: 7,
              },
              this,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
          lineNumber: 824,
          columnNumber: 5,
        },
        this,
      ),
    Ys = () =>
      e.jsxDEV(
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
                          "h2",
                          {
                            className: "text-2xl font-bold",
                            children: "System Health",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 936,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-gray-500",
                            children:
                              "Monitor platform infrastructure and services",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 937,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 935,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    i,
                    {
                      variant: "outline",
                      onClick: () => ae(),
                      children: [
                        e.jsxDEV(
                          re,
                          { className: "h-4 w-4 mr-2" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 940,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        "Refresh",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 939,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 934,
                columnNumber: 7,
              },
              this,
            ),
            Oe
              ? e.jsxDEV(
                  F,
                  { className: "h-96" },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                    lineNumber: 945,
                    columnNumber: 9,
                  },
                  this,
                )
              : e.jsxDEV(
                  e.Fragment,
                  {
                    children: [
                      e.jsxDEV(
                        "div",
                        {
                          className:
                            "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4",
                          children: [
                            e.jsxDEV(
                              l,
                              {
                                children: e.jsxDEV(
                                  m,
                                  {
                                    className: "p-6",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-center justify-between mb-4",
                                          children: [
                                            e.jsxDEV(
                                              Xe,
                                              {
                                                className:
                                                  "h-8 w-8 text-blue-600",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 952,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className: "text-2xl font-bold",
                                                children: [
                                                  n?.server?.cpu || 0,
                                                  "%",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 953,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 951,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-sm text-gray-500",
                                          children: "CPU Usage",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 955,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        O,
                                        {
                                          value: n?.server?.cpu || 0,
                                          className: "mt-2",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 956,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 950,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 949,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              l,
                              {
                                children: e.jsxDEV(
                                  m,
                                  {
                                    className: "p-6",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-center justify-between mb-4",
                                          children: [
                                            e.jsxDEV(
                                              wr,
                                              {
                                                className:
                                                  "h-8 w-8 text-green-600",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 962,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className: "text-2xl font-bold",
                                                children: [
                                                  n?.server?.memory
                                                    ?.percentUsed || 0,
                                                  "%",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 963,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 961,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-sm text-gray-500",
                                          children: "Memory Usage",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 965,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        O,
                                        {
                                          value:
                                            n?.server?.memory?.percentUsed || 0,
                                          className: "mt-2",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 966,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 960,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 959,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              l,
                              {
                                children: e.jsxDEV(
                                  m,
                                  {
                                    className: "p-6",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-center justify-between mb-4",
                                          children: [
                                            e.jsxDEV(
                                              ss,
                                              {
                                                className:
                                                  "h-8 w-8 text-purple-600",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 972,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className: "text-2xl font-bold",
                                                children: [
                                                  n?.server?.disk || 0,
                                                  "%",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 973,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 971,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-sm text-gray-500",
                                          children: "Disk Usage",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 975,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        O,
                                        {
                                          value: n?.server?.disk || 0,
                                          className: "mt-2",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 976,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 970,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 969,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              l,
                              {
                                children: e.jsxDEV(
                                  m,
                                  {
                                    className: "p-6",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-center justify-between mb-4",
                                          children: [
                                            e.jsxDEV(
                                              be,
                                              {
                                                className:
                                                  "h-8 w-8 text-orange-600",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 982,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className: "text-xl font-bold",
                                                children:
                                                  n?.server?.uptimeFormatted ||
                                                  "N/A",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 983,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 981,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-sm text-gray-500",
                                          children: "Server Uptime",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 985,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 980,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 979,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 948,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "div",
                        {
                          className: "grid grid-cols-1 lg:grid-cols-2 gap-6",
                          children: [
                            e.jsxDEV(
                              l,
                              {
                                children: [
                                  e.jsxDEV(
                                    d,
                                    {
                                      children: e.jsxDEV(
                                        N,
                                        {
                                          className: "flex items-center gap-2",
                                          children: [
                                            e.jsxDEV(
                                              ss,
                                              { className: "h-5 w-5" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 993,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            "Database Status",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 992,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 991,
                                      columnNumber: 15,
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
                                              "div",
                                              {
                                                className:
                                                  "flex items-center justify-between p-3 bg-gray-50 rounded-lg",
                                                children: [
                                                  e.jsxDEV(
                                                    "span",
                                                    {
                                                      children:
                                                        "Connection Status",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1e3,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    o,
                                                    {
                                                      variant:
                                                        n?.database?.status ===
                                                        "connected"
                                                          ? "default"
                                                          : "destructive",
                                                      children:
                                                        n?.database?.status ===
                                                        "connected"
                                                          ? e.jsxDEV(
                                                              e.Fragment,
                                                              {
                                                                children: [
                                                                  e.jsxDEV(
                                                                    R,
                                                                    {
                                                                      className:
                                                                        "h-3 w-3 mr-1",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                      lineNumber: 1003,
                                                                      columnNumber: 27,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  " Connected",
                                                                ],
                                                              },
                                                              void 0,
                                                              !0,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                lineNumber: 1003,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            )
                                                          : e.jsxDEV(
                                                              e.Fragment,
                                                              {
                                                                children: [
                                                                  e.jsxDEV(
                                                                    ne,
                                                                    {
                                                                      className:
                                                                        "h-3 w-3 mr-1",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                      lineNumber: 1005,
                                                                      columnNumber: 27,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  " Disconnected",
                                                                ],
                                                              },
                                                              void 0,
                                                              !0,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                lineNumber: 1005,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            ),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1001,
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
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 999,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex items-center justify-between p-3 bg-gray-50 rounded-lg",
                                                children: [
                                                  e.jsxDEV(
                                                    "span",
                                                    {
                                                      children: "Query Latency",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1010,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "span",
                                                    {
                                                      className: "font-medium",
                                                      children: [
                                                        n?.database?.latency ||
                                                          0,
                                                        "ms",
                                                      ],
                                                    },
                                                    void 0,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1011,
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
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1009,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex items-center justify-between p-3 bg-gray-50 rounded-lg",
                                                children: [
                                                  e.jsxDEV(
                                                    "span",
                                                    {
                                                      children:
                                                        "Connection Pool",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1014,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "span",
                                                    {
                                                      className: "font-medium",
                                                      children: [
                                                        n?.database
                                                          ?.connectionPool
                                                          ?.active || 0,
                                                        " / ",
                                                        n?.database
                                                          ?.connectionPool
                                                          ?.max || 20,
                                                      ],
                                                    },
                                                    void 0,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1015,
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
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1013,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 998,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 997,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 990,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              l,
                              {
                                children: [
                                  e.jsxDEV(
                                    d,
                                    {
                                      children: e.jsxDEV(
                                        N,
                                        {
                                          className: "flex items-center gap-2",
                                          children: [
                                            e.jsxDEV(
                                              kr,
                                              { className: "h-5 w-5" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1025,
                                                columnNumber: 19,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1024,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1023,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    m,
                                    {
                                      children: e.jsxDEV(
                                        "div",
                                        {
                                          className: "space-y-3",
                                          children:
                                            n?.externalApis &&
                                            Object.entries(n.externalApis).map(
                                              ([s, a]) =>
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "flex items-center justify-between p-2 hover:bg-gray-50 rounded",
                                                    children: [
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "flex items-center gap-2",
                                                          children: [
                                                            Qs(a.status),
                                                            e.jsxDEV(
                                                              "span",
                                                              {
                                                                className:
                                                                  "capitalize",
                                                                children:
                                                                  s.replace(
                                                                    "_",
                                                                    " ",
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                lineNumber: 1035,
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
                                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                          lineNumber: 1033,
                                                          columnNumber: 23,
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
                                                              o,
                                                              {
                                                                variant:
                                                                  "outline",
                                                                className: $s(
                                                                  a.status,
                                                                ),
                                                                children:
                                                                  a.status,
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                lineNumber: 1038,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              "span",
                                                              {
                                                                className:
                                                                  "text-sm text-gray-500",
                                                                children: [
                                                                  a.latency,
                                                                  "ms",
                                                                ],
                                                              },
                                                              void 0,
                                                              !0,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                lineNumber: 1041,
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
                                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                          lineNumber: 1037,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                    ],
                                                  },
                                                  s,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 1032,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1030,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1029,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1022,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 989,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        l,
                        {
                          children: [
                            e.jsxDEV(
                              d,
                              {
                                className:
                                  "flex flex-row items-center justify-between space-y-0 pb-2",
                                children: [
                                  e.jsxDEV(
                                    N,
                                    {
                                      className: "flex items-center gap-2",
                                      children: [
                                        e.jsxDEV(
                                          Ar,
                                          { className: "h-5 w-5" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1052,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        "DNS Resolver Status",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1051,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    i,
                                    {
                                      variant: "ghost",
                                      size: "sm",
                                      onClick: () => Fs(),
                                      className: "h-8 px-2",
                                      children: e.jsxDEV(
                                        re,
                                        { className: "h-3 w-3" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1056,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1055,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1050,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              m,
                              {
                                className: "pt-4",
                                children:
                                  Ms || D?.ok === !1
                                    ? e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg",
                                          children: [
                                            e.jsxDEV(
                                              ne,
                                              {
                                                className:
                                                  "h-5 w-5 text-red-600 mt-0.5 shrink-0",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1062,
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
                                                        "font-medium text-red-800",
                                                      children:
                                                        "Resolver Unavailable",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1064,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "p",
                                                    {
                                                      className:
                                                        "text-sm text-red-600 mt-1",
                                                      children:
                                                        D?.error ||
                                                        "The recursive DNS resolver module failed to load. Public DNS resolution is degraded. Restart the server to reload it.",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1065,
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
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1063,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1061,
                                          columnNumber: 17,
                                        },
                                        this,
                                      )
                                    : D?.ok
                                      ? e.jsxDEV(
                                          "div",
                                          {
                                            className: "space-y-3",
                                            children: [
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "flex items-center justify-between p-3 bg-gray-50 rounded-lg",
                                                  children: [
                                                    e.jsxDEV(
                                                      "span",
                                                      { children: "Status" },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                        lineNumber: 1073,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      o,
                                                      {
                                                        className:
                                                          "bg-green-100 text-green-800 hover:bg-green-100",
                                                        children: [
                                                          e.jsxDEV(
                                                            R,
                                                            {
                                                              className:
                                                                "h-3 w-3 mr-1",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                              lineNumber: 1075,
                                                              columnNumber: 23,
                                                            },
                                                            this,
                                                          ),
                                                          " Operational",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                        lineNumber: 1074,
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
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1072,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "flex items-center justify-between p-3 bg-gray-50 rounded-lg",
                                                  children: [
                                                    e.jsxDEV(
                                                      "span",
                                                      {
                                                        children:
                                                          "Resolver Type",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                        lineNumber: 1079,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "span",
                                                      {
                                                        className:
                                                          "font-medium text-sm",
                                                        children: [
                                                          D.type ?? "iterative",
                                                          " · ",
                                                          D.roots ?? 13,
                                                          " root servers",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                        lineNumber: 1080,
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
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1078,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              D.cache &&
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "flex items-center justify-between p-3 bg-gray-50 rounded-lg",
                                                    children: [
                                                      e.jsxDEV(
                                                        "span",
                                                        {
                                                          children:
                                                            "Cache Entries",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                          lineNumber: 1084,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        "span",
                                                        {
                                                          className:
                                                            "font-medium",
                                                          children: [
                                                            D.cache.size.toLocaleString(),
                                                            " / ",
                                                            D.cache.maxSize.toLocaleString(),
                                                          ],
                                                        },
                                                        void 0,
                                                        !0,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                          lineNumber: 1085,
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
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 1083,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "flex items-center justify-between p-3 bg-gray-50 rounded-lg",
                                                  children: [
                                                    e.jsxDEV(
                                                      "span",
                                                      { children: "Version" },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                        lineNumber: 1091,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "span",
                                                      {
                                                        className:
                                                          "font-medium text-sm",
                                                        children:
                                                          D.version ?? "1.0.0",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                        lineNumber: 1092,
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
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1090,
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
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1071,
                                            columnNumber: 17,
                                          },
                                          this,
                                        )
                                      : e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "flex items-center gap-2 p-4 text-gray-500",
                                            children: [
                                              e.jsxDEV(
                                                Q,
                                                {
                                                  className:
                                                    "h-4 w-4 animate-spin",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1097,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className: "text-sm",
                                                  children:
                                                    "Checking resolver status...",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1098,
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
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1096,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1059,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 1049,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        l,
                        {
                          children: [
                            e.jsxDEV(
                              d,
                              {
                                children: e.jsxDEV(
                                  N,
                                  {
                                    className: "flex items-center gap-2",
                                    children: [
                                      e.jsxDEV(
                                        se,
                                        { className: "h-5 w-5" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1106,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      "Error Tracking",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1105,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1104,
                                columnNumber: 13,
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
                                      "grid grid-cols-1 md:grid-cols-3 gap-4",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: "p-4 bg-red-50 rounded-lg",
                                          children: [
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-red-800 text-sm",
                                                children: "Last 24 Hours",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1113,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-3xl font-bold text-red-900",
                                                children:
                                                  n?.errorTracking?.last24h ||
                                                  0,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1114,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1112,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "p-4 bg-orange-50 rounded-lg",
                                          children: [
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-orange-800 text-sm",
                                                children: "Last 7 Days",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1117,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-3xl font-bold text-orange-900",
                                                children:
                                                  n?.errorTracking?.last7d || 0,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1118,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1116,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "p-4 bg-gray-50 rounded-lg",
                                          children: [
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-gray-800 text-sm",
                                                children: "Error Rate",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1121,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-3xl font-bold text-gray-900",
                                                children:
                                                  n?.errorTracking?.errorRate ||
                                                  "0%",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1122,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1120,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1111,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1110,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 1103,
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
                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                    lineNumber: 947,
                    columnNumber: 9,
                  },
                  this,
                ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
          lineNumber: 933,
          columnNumber: 5,
        },
        this,
      ),
    Xs = () =>
      e.jsxDEV(
        "div",
        {
          className: "space-y-6",
          children: [
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h2",
                    {
                      className: "text-2xl font-bold",
                      children: "Platform Analytics",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1135,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "p",
                    {
                      className: "text-gray-500",
                      children: "Revenue, growth, and feature usage metrics",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1136,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1134,
                columnNumber: 7,
              },
              this,
            ),
            Ts
              ? e.jsxDEV(
                  F,
                  { className: "h-96" },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                    lineNumber: 1139,
                    columnNumber: 9,
                  },
                  this,
                )
              : e.jsxDEV(
                  e.Fragment,
                  {
                    children: [
                      e.jsxDEV(
                        "div",
                        {
                          className:
                            "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4",
                          children: [
                            e.jsxDEV(
                              l,
                              {
                                children: e.jsxDEV(
                                  m,
                                  {
                                    className: "p-6",
                                    children: [
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-sm text-gray-500",
                                          children: "Monthly Revenue",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1145,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-3xl font-bold",
                                          children: [
                                            "$",
                                            b?.totalRevenue?.toLocaleString() ||
                                              "0",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1146,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-sm text-green-600",
                                          children: [
                                            "+",
                                            b?.revenueGrowth || 0,
                                            "% from last month",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1147,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1143,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              l,
                              {
                                children: e.jsxDEV(
                                  m,
                                  {
                                    className: "p-6",
                                    children: [
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-sm text-gray-500",
                                          children: "New Users (30d)",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1152,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-3xl font-bold",
                                          children: b?.newUsers || 0,
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1153,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-sm text-green-600",
                                          children: [
                                            "+",
                                            b?.userGrowthRate?.toFixed(1) || 0,
                                            "% growth rate",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1154,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1151,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1150,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              l,
                              {
                                children: e.jsxDEV(
                                  m,
                                  {
                                    className: "p-6",
                                    children: [
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-sm text-gray-500",
                                          children: "Total Streams",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1159,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-3xl font-bold",
                                          children:
                                            b?.totalStreams?.toLocaleString() ||
                                            "0",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1160,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1158,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1157,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              l,
                              {
                                children: e.jsxDEV(
                                  m,
                                  {
                                    className: "p-6",
                                    children: [
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-sm text-gray-500",
                                          children: "Active Projects",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1165,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-3xl font-bold",
                                          children:
                                            b?.totalProjects?.toLocaleString() ||
                                            "0",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1166,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1164,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1163,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 1142,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "div",
                        {
                          className: "grid grid-cols-1 lg:grid-cols-2 gap-6",
                          children: [
                            e.jsxDEV(
                              l,
                              {
                                children: [
                                  e.jsxDEV(
                                    d,
                                    {
                                      children: e.jsxDEV(
                                        N,
                                        {
                                          children: "Subscription Distribution",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1173,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1172,
                                      columnNumber: 15,
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
                                          children: b?.subscriptionStats?.map(
                                            (s) =>
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
                                                          "flex items-center gap-2",
                                                        children: [
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className: `w-3 h-3 rounded-full ${s.plan === "lifetime" ? "bg-purple-500" : s.plan === "yearly" ? "bg-blue-500" : s.plan === "monthly" ? "bg-green-500" : "bg-gray-400"}`,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                              lineNumber: 1180,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "span",
                                                            {
                                                              className:
                                                                "capitalize",
                                                              children:
                                                                s.plan ||
                                                                "free",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                              lineNumber: 1185,
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
                                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                        lineNumber: 1179,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "span",
                                                      {
                                                        className:
                                                          "font-medium",
                                                        children: [
                                                          s.count,
                                                          " users",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                        lineNumber: 1187,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  ],
                                                },
                                                s.plan,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1178,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1176,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1175,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1171,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              l,
                              {
                                children: [
                                  e.jsxDEV(
                                    d,
                                    {
                                      children: e.jsxDEV(
                                        N,
                                        { children: "Feature Usage" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1195,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1194,
                                      columnNumber: 15,
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
                                          children: b?.featureUsage?.map((s) =>
                                            e.jsxDEV(
                                              "div",
                                              {
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex items-center justify-between mb-1",
                                                      children: [
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "text-sm",
                                                            children: s.feature,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 1202,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "text-sm font-medium",
                                                            children: [
                                                              s.percentage,
                                                              "%",
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 1203,
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
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1201,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    O,
                                                    {
                                                      value: s.percentage,
                                                      className: "h-2",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1205,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                ],
                                              },
                                              s.feature,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1200,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1198,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1197,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1193,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 1170,
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
                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                    lineNumber: 1141,
                    columnNumber: 9,
                  },
                  this,
                ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
          lineNumber: 1133,
          columnNumber: 5,
        },
        this,
      ),
    Js = () =>
      e.jsxDEV(
        "div",
        {
          className: "space-y-6",
          children: [
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h2",
                    {
                      className:
                        "text-2xl font-bold text-red-600 flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          we,
                          { className: "h-6 w-6" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1221,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        "Kill Switch Control",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1220,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "p",
                    {
                      className: "text-gray-500",
                      children: "Emergency controls for autonomous systems",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1224,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1219,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              l,
              {
                className: n?.killSwitch?.globalKilled
                  ? "border-red-500 bg-red-50"
                  : "",
                children: [
                  e.jsxDEV(
                    d,
                    {
                      children: [
                        e.jsxDEV(
                          N,
                          {
                            className: "flex items-center justify-between",
                            children: [
                              e.jsxDEV(
                                "span",
                                { children: "Global Kill Switch" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1229,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                o,
                                {
                                  variant: n?.killSwitch?.globalKilled
                                    ? "destructive"
                                    : "default",
                                  children: n?.killSwitch?.globalKilled
                                    ? "ACTIVATED"
                                    : "INACTIVE",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1230,
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
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1228,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          L,
                          {
                            children:
                              "Emergency stop for all autonomous systems. Use with caution.",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1234,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1227,
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
                            n?.killSwitch?.globalKilled
                              ? e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "p-4 bg-red-100 border border-red-300 rounded-lg",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-center gap-2 text-red-800 mb-2",
                                          children: [
                                            e.jsxDEV(
                                              pe,
                                              { className: "h-5 w-5" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1243,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className: "font-medium",
                                                children: "All Systems Stopped",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1244,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1242,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-sm text-red-700",
                                          children:
                                            "All autonomous operations are currently paused.",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1246,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1241,
                                    columnNumber: 15,
                                  },
                                  this,
                                )
                              : e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "p-4 bg-green-100 border border-green-300 rounded-lg",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-center gap-2 text-green-800 mb-2",
                                          children: [
                                            e.jsxDEV(
                                              R,
                                              { className: "h-5 w-5" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1253,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className: "font-medium",
                                                children: "Systems Operational",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1254,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1252,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "text-sm text-green-700",
                                          children:
                                            "All autonomous systems are running normally.",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1256,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1251,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "flex gap-4",
                                children: n?.killSwitch?.globalKilled
                                  ? e.jsxDEV(
                                      i,
                                      {
                                        className: "flex-1",
                                        onClick: () => {
                                          (Be("all"), W(!0));
                                        },
                                        children: [
                                          e.jsxDEV(
                                            we,
                                            { className: "h-4 w-4 mr-2" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1270,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          "Resume All Systems",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1263,
                                        columnNumber: 17,
                                      },
                                      this,
                                    )
                                  : e.jsxDEV(
                                      i,
                                      {
                                        variant: "destructive",
                                        className: "flex-1",
                                        onClick: () => {
                                          (Be("all"), W(!0));
                                        },
                                        children: [
                                          e.jsxDEV(
                                            pe,
                                            { className: "h-4 w-4 mr-2" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1282,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          "Emergency Stop All",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1274,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 1239,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1238,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1226,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              l,
              {
                children: [
                  e.jsxDEV(
                    d,
                    {
                      children: e.jsxDEV(
                        N,
                        { children: "Individual System Controls" },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 1292,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1291,
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
                          className: "grid grid-cols-1 md:grid-cols-2 gap-4",
                          children:
                            n?.killSwitch?.systemStates &&
                            Object.entries(n.killSwitch.systemStates).map(
                              ([s, a]) =>
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: `p-4 border rounded-lg ${a ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`,
                                    children: e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "flex items-center justify-between",
                                        children: [
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "flex items-center gap-2",
                                              children: [
                                                a
                                                  ? e.jsxDEV(
                                                      ne,
                                                      {
                                                        className:
                                                          "h-5 w-5 text-red-600",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                        lineNumber: 1304,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    )
                                                  : e.jsxDEV(
                                                      R,
                                                      {
                                                        className:
                                                          "h-5 w-5 text-green-600",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                        lineNumber: 1306,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                e.jsxDEV(
                                                  "span",
                                                  {
                                                    className:
                                                      "font-medium capitalize",
                                                    children: s.replace(
                                                      "_",
                                                      " ",
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 1308,
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
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1302,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            o,
                                            {
                                              variant: a
                                                ? "destructive"
                                                : "default",
                                              children: a
                                                ? "Stopped"
                                                : "Running",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1310,
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
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1301,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                  },
                                  s,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1297,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 1295,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1294,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1290,
                columnNumber: 7,
              },
              this,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
          lineNumber: 1218,
          columnNumber: 5,
        },
        this,
      ),
    Zs = () =>
      e.jsxDEV(
        "div",
        {
          className: "space-y-6",
          children: [
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h2",
                    {
                      className:
                        "text-2xl font-bold text-amber-600 flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          vs,
                          { className: "h-6 w-6" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1326,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        "Payment Bypass",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1325,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "p",
                    {
                      className: "text-gray-500",
                      children:
                        "Temporarily waive payment requirements for all users. Requires admin + 2FA.",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1329,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1324,
                columnNumber: 7,
              },
              this,
            ),
            Ks
              ? e.jsxDEV(
                  l,
                  {
                    children: e.jsxDEV(
                      m,
                      {
                        className: "pt-6",
                        children: e.jsxDEV(
                          F,
                          { className: "h-24 w-full" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1333,
                            columnNumber: 45,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                        lineNumber: 1333,
                        columnNumber: 15,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                    lineNumber: 1333,
                    columnNumber: 9,
                  },
                  this,
                )
              : e.jsxDEV(
                  e.Fragment,
                  {
                    children: [
                      e.jsxDEV(
                        l,
                        {
                          className: x?.bypassed
                            ? "border-amber-400 bg-amber-50"
                            : "",
                          children: [
                            e.jsxDEV(
                              d,
                              {
                                children: [
                                  e.jsxDEV(
                                    N,
                                    {
                                      className:
                                        "flex items-center justify-between",
                                      children: [
                                        e.jsxDEV(
                                          "span",
                                          { children: "Bypass Status" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1339,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          o,
                                          {
                                            variant: x?.bypassed
                                              ? "default"
                                              : "secondary",
                                            className: x?.bypassed
                                              ? "bg-amber-500 text-white"
                                              : "",
                                            children: x?.bypassed
                                              ? "ACTIVE"
                                              : "INACTIVE",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1340,
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
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1338,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    L,
                                    {
                                      children:
                                        "When active, all authenticated users pass the subscription gate regardless of their plan.",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1345,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1337,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              m,
                              {
                                className: "space-y-4",
                                children: [
                                  x?.bypassed
                                    ? e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "p-4 bg-amber-100 border border-amber-300 rounded-lg space-y-2",
                                          children: [
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex items-center gap-2 text-amber-800 font-medium",
                                                children: [
                                                  e.jsxDEV(
                                                    xe,
                                                    { className: "h-5 w-5" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1353,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  "Payment requirements are currently bypassed",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1352,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            x.timeRemaining &&
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "flex items-center gap-2 text-sm text-amber-700",
                                                  children: [
                                                    e.jsxDEV(
                                                      be,
                                                      { className: "h-4 w-4" },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                        lineNumber: 1358,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    "Expires in: ",
                                                    e.jsxDEV(
                                                      "span",
                                                      {
                                                        className:
                                                          "font-mono font-semibold",
                                                        children:
                                                          x.timeRemaining,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                        lineNumber: 1359,
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
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1357,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                            x.config.reason &&
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-sm text-amber-700",
                                                  children: [
                                                    "Reason: ",
                                                    x.config.reason,
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1363,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                            x.config.activatedBy &&
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-xs text-amber-600",
                                                  children: [
                                                    "Activated by: ",
                                                    x.config.activatedBy,
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1366,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                            x.config.activatedAt &&
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-xs text-amber-600",
                                                  children: [
                                                    "Activated at: ",
                                                    new Date(
                                                      x.config.activatedAt,
                                                    ).toLocaleString(),
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1369,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1351,
                                          columnNumber: 17,
                                        },
                                        this,
                                      )
                                    : e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "p-4 bg-green-50 border border-green-200 rounded-lg",
                                          children: [
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex items-center gap-2 text-green-800 font-medium",
                                                children: [
                                                  e.jsxDEV(
                                                    Je,
                                                    { className: "h-5 w-5" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1377,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  "Payment requirements are enforced",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1376,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-sm text-green-700 mt-1",
                                                children:
                                                  "Users must have an active subscription, trial, or be within the grace period to access premium features.",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1380,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1375,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                  x?.bypassed
                                    ? e.jsxDEV(
                                        i,
                                        {
                                          variant: "destructive",
                                          onClick: () => de.mutate(),
                                          disabled: de.isPending,
                                          className: "w-full",
                                          children: [
                                            de.isPending
                                              ? e.jsxDEV(
                                                  Q,
                                                  {
                                                    className:
                                                      "h-4 w-4 mr-2 animate-spin",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 1394,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                )
                                              : e.jsxDEV(
                                                  Je,
                                                  { className: "h-4 w-4 mr-2" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 1396,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                            "Deactivate Bypass Now",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1387,
                                          columnNumber: 17,
                                        },
                                        this,
                                      )
                                    : null,
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1349,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 1336,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      !x?.bypassed &&
                        e.jsxDEV(
                          l,
                          {
                            children: [
                              e.jsxDEV(
                                d,
                                {
                                  children: [
                                    e.jsxDEV(
                                      N,
                                      {
                                        className: "flex items-center gap-2",
                                        children: [
                                          e.jsxDEV(
                                            xe,
                                            {
                                              className:
                                                "h-5 w-5 text-amber-600",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1408,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          "Activate Bypass",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1407,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      L,
                                      {
                                        children:
                                          "Set a duration and optional reason. Maximum 72 hours per activation.",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1411,
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
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1406,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                m,
                                {
                                  className: "space-y-4",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "grid grid-cols-2 gap-4",
                                        children: [
                                          e.jsxDEV(
                                            "div",
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  j,
                                                  {
                                                    htmlFor: "bypass-duration",
                                                    children:
                                                      "Duration (hours)",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 1418,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  S,
                                                  {
                                                    id: "bypass-duration",
                                                    type: "number",
                                                    min: "1",
                                                    max: "72",
                                                    value: J,
                                                    onChange: (s) =>
                                                      Rs(s.target.value),
                                                    className: "mt-1",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 1419,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "p",
                                                  {
                                                    className:
                                                      "text-xs text-gray-400 mt-1",
                                                    children: "Max 72 hours",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                    lineNumber: 1428,
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
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1417,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className: "flex items-end",
                                              children: e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "text-sm text-gray-500",
                                                  children: [
                                                    "Expires: ",
                                                    e.jsxDEV(
                                                      "span",
                                                      {
                                                        className:
                                                          "font-medium",
                                                        children: (() => {
                                                          const s =
                                                            parseFloat(J) || 0;
                                                          return s <= 0
                                                            ? "—"
                                                            : new Date(
                                                                Date.now() +
                                                                  s * 36e5,
                                                              ).toLocaleString();
                                                        })(),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                        lineNumber: 1432,
                                                        columnNumber: 32,
                                                      },
                                                      this,
                                                    ),
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1431,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1430,
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
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1416,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            j,
                                            {
                                              htmlFor: "bypass-reason",
                                              children: "Reason (optional)",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1444,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            S,
                                            {
                                              id: "bypass-reason",
                                              value: qe,
                                              onChange: (s) =>
                                                Ie(s.target.value),
                                              placeholder:
                                                "e.g. Testing new onboarding flow",
                                              className: "mt-1",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1445,
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
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1443,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      i,
                                      {
                                        className:
                                          "w-full bg-amber-600 hover:bg-amber-700 text-white",
                                        onClick: () => {
                                          const s = Math.min(
                                            72,
                                            Math.max(1, parseFloat(J) || 2),
                                          );
                                          ue.mutate({
                                            durationHours: s,
                                            reason: qe,
                                          });
                                        },
                                        disabled: ue.isPending,
                                        children: [
                                          ue.isPending
                                            ? e.jsxDEV(
                                                Q,
                                                {
                                                  className:
                                                    "h-4 w-4 mr-2 animate-spin",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1462,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              )
                                            : e.jsxDEV(
                                                xe,
                                                { className: "h-4 w-4 mr-2" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1464,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                          "Activate Payment Bypass",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1453,
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
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1415,
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
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1405,
                            columnNumber: 13,
                          },
                          this,
                        ),
                      x?.bypassed &&
                        e.jsxDEV(
                          l,
                          {
                            children: [
                              e.jsxDEV(
                                d,
                                {
                                  children: [
                                    e.jsxDEV(
                                      N,
                                      {
                                        className: "flex items-center gap-2",
                                        children: [
                                          e.jsxDEV(
                                            be,
                                            {
                                              className:
                                                "h-5 w-5 text-amber-600",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1476,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          "Extend Active Bypass",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1475,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      L,
                                      {
                                        children:
                                          "Add more time to the current bypass window. Maximum 24 hours per extension.",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1479,
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
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1474,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                m,
                                {
                                  className: "space-y-4",
                                  children: e.jsxDEV(
                                    "div",
                                    {
                                      className: "flex gap-4 items-end",
                                      children: [
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "flex-1",
                                            children: [
                                              e.jsxDEV(
                                                j,
                                                {
                                                  htmlFor: "extend-hours",
                                                  children: "Additional hours",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1484,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                S,
                                                {
                                                  id: "extend-hours",
                                                  type: "number",
                                                  min: "1",
                                                  max: "24",
                                                  value: me,
                                                  onChange: (s) =>
                                                    Ps(s.target.value),
                                                  className: "mt-1",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                  lineNumber: 1485,
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
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1483,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          i,
                                          {
                                            variant: "outline",
                                            onClick: () =>
                                              Ne.mutate(
                                                Math.min(
                                                  24,
                                                  Math.max(
                                                    1,
                                                    parseFloat(me) || 1,
                                                  ),
                                                ),
                                              ),
                                            disabled: Ne.isPending,
                                            children: [
                                              Ne.isPending
                                                ? e.jsxDEV(
                                                    Q,
                                                    {
                                                      className:
                                                        "h-4 w-4 mr-2 animate-spin",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1501,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  )
                                                : e.jsxDEV(
                                                    re,
                                                    {
                                                      className: "h-4 w-4 mr-2",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1503,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                              "Extend",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1495,
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
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1482,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1481,
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
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1473,
                            columnNumber: 13,
                          },
                          this,
                        ),
                      e.jsxDEV(
                        l,
                        {
                          children: [
                            e.jsxDEV(
                              d,
                              {
                                children: e.jsxDEV(
                                  N,
                                  {
                                    className:
                                      "flex items-center gap-2 text-sm",
                                    children: [
                                      e.jsxDEV(
                                        Ze,
                                        { className: "h-4 w-4 text-blue-500" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1515,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      "What this affects",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1514,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1513,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              m,
                              {
                                children: e.jsxDEV(
                                  "ul",
                                  {
                                    className:
                                      "text-sm text-gray-600 space-y-1 list-disc list-inside",
                                    children: [
                                      e.jsxDEV(
                                        "li",
                                        {
                                          children: [
                                            "All ",
                                            e.jsxDEV(
                                              "code",
                                              {
                                                className:
                                                  "text-xs bg-gray-100 px-1 rounded",
                                                children: "requirePremium",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1521,
                                                columnNumber: 25,
                                              },
                                              this,
                                            ),
                                            " middleware gates are bypassed instantly",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1521,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "li",
                                        {
                                          children:
                                            "Users with free, expired, or no subscription gain full access",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1522,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "li",
                                        {
                                          children: [
                                            "Every protected API response includes an ",
                                            e.jsxDEV(
                                              "code",
                                              {
                                                className:
                                                  "text-xs bg-gray-100 px-1 rounded",
                                                children:
                                                  "X-Payment-Bypass: active",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1523,
                                                columnNumber: 62,
                                              },
                                              this,
                                            ),
                                            " header",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1523,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "li",
                                        {
                                          children:
                                            "State is persisted to the database — survives server restarts",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1524,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "li",
                                        {
                                          children:
                                            "Auto-expires at the set time with no manual action needed",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1525,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "li",
                                        {
                                          children:
                                            "All activate/deactivate actions are logged with admin ID and reason",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1526,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1520,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1519,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 1512,
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
                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                    lineNumber: 1335,
                    columnNumber: 9,
                  },
                  this,
                ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
          lineNumber: 1323,
          columnNumber: 5,
        },
        this,
      ),
    er = () =>
      e.jsxDEV(
        "div",
        {
          className: "space-y-6",
          children: [
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h2",
                    {
                      className: "text-2xl font-bold",
                      children: "Platform Settings",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1538,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "p",
                    {
                      className: "text-gray-500",
                      children: "Configure global platform settings",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1539,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1537,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                className: "grid grid-cols-1 lg:grid-cols-2 gap-6",
                children: [
                  e.jsxDEV(
                    l,
                    {
                      children: [
                        e.jsxDEV(
                          d,
                          {
                            children: e.jsxDEV(
                              N,
                              { children: "General Settings" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1544,
                                columnNumber: 13,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1543,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          m,
                          {
                            className: "space-y-4",
                            children: [
                              e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "flex items-center justify-between p-3 bg-gray-50 rounded-lg",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className: "font-medium",
                                              children: "Maintenance Mode",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1549,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-sm text-gray-500",
                                              children:
                                                "Disable access for non-admin users",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1550,
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
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1548,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      o,
                                      {
                                        variant: q?.maintenanceMode
                                          ? "destructive"
                                          : "secondary",
                                        children: q?.maintenanceMode
                                          ? "Enabled"
                                          : "Disabled",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1552,
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
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1547,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "flex items-center justify-between p-3 bg-gray-50 rounded-lg",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className: "font-medium",
                                              children: "User Registration",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1558,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-sm text-gray-500",
                                              children:
                                                "Allow new user signups",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1559,
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
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1557,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      o,
                                      {
                                        variant: q?.userRegistrationEnabled
                                          ? "default"
                                          : "secondary",
                                        children: q?.userRegistrationEnabled
                                          ? "Enabled"
                                          : "Disabled",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1561,
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
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1556,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "flex items-center justify-between p-3 bg-gray-50 rounded-lg",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className: "font-medium",
                                              children: "Email Notifications",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1567,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-sm text-gray-500",
                                              children: "Send system emails",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1568,
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
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1566,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      o,
                                      {
                                        variant: q?.emailNotifications
                                          ? "default"
                                          : "secondary",
                                        children: q?.emailNotifications
                                          ? "Enabled"
                                          : "Disabled",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1570,
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
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1565,
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
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1546,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1542,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    l,
                    {
                      children: [
                        e.jsxDEV(
                          d,
                          {
                            children: e.jsxDEV(
                              N,
                              { children: "Quick Actions" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1578,
                                columnNumber: 13,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1577,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          m,
                          {
                            className: "space-y-3",
                            children: [
                              e.jsxDEV(
                                i,
                                {
                                  variant: "outline",
                                  className: "w-full justify-start",
                                  onClick: () => H("/admin/kyc"),
                                  children: [
                                    e.jsxDEV(
                                      he,
                                      { className: "h-4 w-4 mr-2" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1582,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    "KYC Verification Review",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1581,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                i,
                                {
                                  variant: "outline",
                                  className: "w-full justify-start",
                                  onClick: () => H("/admin/security"),
                                  children: [
                                    e.jsxDEV(
                                      he,
                                      { className: "h-4 w-4 mr-2" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1586,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    "Security Dashboard",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1585,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                i,
                                {
                                  variant: "outline",
                                  className: "w-full justify-start",
                                  onClick: () => H("/admin/support"),
                                  children: [
                                    e.jsxDEV(
                                      fr,
                                      { className: "h-4 w-4 mr-2" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1590,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    "Support Dashboard",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1589,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                i,
                                {
                                  variant: "outline",
                                  className: "w-full justify-start",
                                  onClick: () => H("/admin/training"),
                                  children: [
                                    e.jsxDEV(
                                      Xe,
                                      { className: "h-4 w-4 mr-2" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1594,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    "Model Training",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1593,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                i,
                                {
                                  variant: "outline",
                                  className: "w-full justify-start",
                                  onClick: () => H("/admin/autonomy"),
                                  children: [
                                    e.jsxDEV(
                                      gr,
                                      { className: "h-4 w-4 mr-2" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1598,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    "Autonomy Controls",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1597,
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
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1580,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1576,
                      columnNumber: 9,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1541,
                columnNumber: 7,
              },
              this,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
          lineNumber: 1536,
          columnNumber: 5,
        },
        this,
      ),
    sr = () => {
      const [s, a] = c.useState(null),
        [v, w] = c.useState(null),
        [I, Z] = c.useState(null),
        { data: nr, refetch: ir } = A({
          queryKey: ["/api/admin/financial-config/royalty-rates"],
        }),
        { data: lr, refetch: mr } = A({
          queryKey: ["/api/admin/financial-config/tax-treaties"],
        }),
        { data: ar, refetch: tr } = A({
          queryKey: ["/api/admin/financial-config/label-settings"],
        }),
        Ge = f({
          mutationFn: async ({ id: r, field: k, value: ee }) =>
            (
              await g(
                "PATCH",
                `/api/admin/financial-config/royalty-rates/${r}`,
                { [k]: parseFloat(ee) },
              )
            ).json(),
          onSuccess: () => {
            (ir(), a(null), u({ title: "Rate updated successfully" }));
          },
          onError: () => u({ title: "Update failed", variant: "destructive" }),
        }),
        cr = f({
          mutationFn: async ({ id: r, field: k, value: ee }) =>
            (
              await g(
                "PATCH",
                `/api/admin/financial-config/tax-treaties/${r}`,
                { [k]: parseFloat(ee) },
              )
            ).json(),
          onSuccess: () => {
            (mr(), Z(null), u({ title: "Treaty rate updated" }));
          },
          onError: () => u({ title: "Update failed", variant: "destructive" }),
        }),
        or = f({
          mutationFn: async ({ key: r, value: k }) =>
            (
              await g(
                "PATCH",
                `/api/admin/financial-config/label-settings/${r}`,
                { value: k },
              )
            ).json(),
          onSuccess: () => {
            (tr(), w(null), u({ title: "Setting updated" }));
          },
          onError: () => u({ title: "Update failed", variant: "destructive" }),
        });
      return e.jsxDEV(
        "div",
        {
          className: "space-y-6",
          children: [
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h2",
                    {
                      className: "text-2xl font-bold",
                      children: "Financial Configuration",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1652,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "p",
                    {
                      className: "text-muted-foreground text-sm",
                      children:
                        "Manage DSP royalty rates, tax treaty rates, and label settings. Changes take effect within 1 hour (cache TTL).",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1653,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1651,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              l,
              {
                children: [
                  e.jsxDEV(
                    d,
                    {
                      children: [
                        e.jsxDEV(
                          N,
                          {
                            className: "flex items-center gap-2",
                            children: [
                              e.jsxDEV(
                                We,
                                { className: "w-5 h-5" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1659,
                                  columnNumber: 60,
                                },
                                this,
                              ),
                              " DSP Royalty Rates",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1659,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          L,
                          {
                            children:
                              "Per-stream base rates in USD. Edit inline — changes update the active royalty calculation engine.",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1660,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1658,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    m,
                    {
                      children: e.jsxDEV(
                        fe,
                        {
                          children: [
                            e.jsxDEV(
                              ge,
                              {
                                children: e.jsxDEV(
                                  z,
                                  {
                                    children: [
                                      e.jsxDEV(
                                        h,
                                        { children: "Platform" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1666,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        h,
                                        { children: "Base Rate / Stream" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1667,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        h,
                                        { children: "Premium Multiplier" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1668,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        h,
                                        { children: "Updated" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1669,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        h,
                                        { children: "Actions" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1670,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1665,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1664,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              ve,
                              {
                                children: nr?.rates?.map((r) =>
                                  e.jsxDEV(
                                    z,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          p,
                                          {
                                            className: "font-medium",
                                            children: r.displayName,
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1676,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          p,
                                          {
                                            children:
                                              s?.id === r.id &&
                                              s.field === "baseRatePerStream"
                                                ? e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex items-center gap-2",
                                                      children: [
                                                        e.jsxDEV(
                                                          S,
                                                          {
                                                            className:
                                                              "w-28 h-7 text-xs",
                                                            type: "number",
                                                            step: "0.00001",
                                                            value: s.value,
                                                            onChange: (k) =>
                                                              a({
                                                                ...s,
                                                                value:
                                                                  k.target
                                                                    .value,
                                                              }),
                                                            autoFocus: !0,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 1680,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          i,
                                                          {
                                                            size: "sm",
                                                            className:
                                                              "h-7 px-2",
                                                            onClick: () =>
                                                              Ge.mutate({
                                                                id: r.id,
                                                                field:
                                                                  "baseRatePerStream",
                                                                value: s.value,
                                                              }),
                                                            children: e.jsxDEV(
                                                              ie,
                                                              {
                                                                className:
                                                                  "w-3 h-3",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                lineNumber: 1689,
                                                                columnNumber: 29,
                                                              },
                                                              this,
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 1688,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          i,
                                                          {
                                                            size: "sm",
                                                            variant: "ghost",
                                                            className:
                                                              "h-7 px-2",
                                                            onClick: () =>
                                                              a(null),
                                                            children: "✕",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 1691,
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
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1679,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  )
                                                : e.jsxDEV(
                                                    "span",
                                                    {
                                                      className: "font-mono",
                                                      children: [
                                                        "$",
                                                        r.baseRatePerStream.toFixed(
                                                          5,
                                                        ),
                                                      ],
                                                    },
                                                    void 0,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1694,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1677,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          p,
                                          {
                                            children:
                                              s?.id === r.id &&
                                              s.field === "premiumMultiplier"
                                                ? e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex items-center gap-2",
                                                      children: [
                                                        e.jsxDEV(
                                                          S,
                                                          {
                                                            className:
                                                              "w-20 h-7 text-xs",
                                                            type: "number",
                                                            step: "0.01",
                                                            value: s.value,
                                                            onChange: (k) =>
                                                              a({
                                                                ...s,
                                                                value:
                                                                  k.target
                                                                    .value,
                                                              }),
                                                            autoFocus: !0,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 1700,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          i,
                                                          {
                                                            size: "sm",
                                                            className:
                                                              "h-7 px-2",
                                                            onClick: () =>
                                                              Ge.mutate({
                                                                id: r.id,
                                                                field:
                                                                  "premiumMultiplier",
                                                                value: s.value,
                                                              }),
                                                            children: e.jsxDEV(
                                                              ie,
                                                              {
                                                                className:
                                                                  "w-3 h-3",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                lineNumber: 1709,
                                                                columnNumber: 29,
                                                              },
                                                              this,
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 1708,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          i,
                                                          {
                                                            size: "sm",
                                                            variant: "ghost",
                                                            className:
                                                              "h-7 px-2",
                                                            onClick: () =>
                                                              a(null),
                                                            children: "✕",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 1711,
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
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1699,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  )
                                                : e.jsxDEV(
                                                    "span",
                                                    {
                                                      className: "font-mono",
                                                      children: [
                                                        r.premiumMultiplier.toFixed(
                                                          2,
                                                        ),
                                                        "×",
                                                      ],
                                                    },
                                                    void 0,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1714,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1697,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          p,
                                          {
                                            className:
                                              "text-xs text-muted-foreground",
                                            children: new Date(
                                              r.updatedAt,
                                            ).toLocaleDateString(),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1717,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          p,
                                          {
                                            children: e.jsxDEV(
                                              "div",
                                              {
                                                className: "flex gap-1",
                                                children: [
                                                  e.jsxDEV(
                                                    i,
                                                    {
                                                      size: "sm",
                                                      variant: "outline",
                                                      className: "h-7 text-xs",
                                                      onClick: () =>
                                                        a({
                                                          id: r.id,
                                                          field:
                                                            "baseRatePerStream",
                                                          value:
                                                            r.baseRatePerStream.toString(),
                                                        }),
                                                      children: "Rate",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1720,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    i,
                                                    {
                                                      size: "sm",
                                                      variant: "outline",
                                                      className: "h-7 text-xs",
                                                      onClick: () =>
                                                        a({
                                                          id: r.id,
                                                          field:
                                                            "premiumMultiplier",
                                                          value:
                                                            r.premiumMultiplier.toString(),
                                                        }),
                                                      children: "Premium",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1721,
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
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1719,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1718,
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
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1675,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1673,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 1663,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1662,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1657,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              l,
              {
                children: [
                  e.jsxDEV(
                    d,
                    {
                      children: [
                        e.jsxDEV(
                          N,
                          {
                            className: "flex items-center gap-2",
                            children: [
                              e.jsxDEV(
                                ws,
                                { className: "w-5 h-5" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1734,
                                  columnNumber: 60,
                                },
                                this,
                              ),
                              " Label Settings",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1734,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          L,
                          {
                            children:
                              "ISRC registrant code, UPC company prefix, and other label-level configuration.",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1735,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1733,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    m,
                    {
                      className: "space-y-3",
                      children: ar?.settings?.map((r) =>
                        e.jsxDEV(
                          "div",
                          {
                            className:
                              "flex items-start justify-between gap-4 py-2 border-b last:border-0",
                            children: [
                              e.jsxDEV(
                                "div",
                                {
                                  className: "flex-1",
                                  children: [
                                    e.jsxDEV(
                                      "p",
                                      {
                                        className:
                                          "text-sm font-medium font-mono",
                                        children: r.key,
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1741,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "p",
                                      {
                                        className:
                                          "text-xs text-muted-foreground",
                                        children: r.description,
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1742,
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
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1740,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              v?.key === r.key
                                ? e.jsxDEV(
                                    "div",
                                    {
                                      className: "flex items-center gap-2",
                                      children: [
                                        e.jsxDEV(
                                          S,
                                          {
                                            className:
                                              "w-40 h-7 text-xs font-mono",
                                            value: v.value,
                                            onChange: (k) =>
                                              w({
                                                ...v,
                                                value: k.target.value,
                                              }),
                                            autoFocus: !0,
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1746,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          i,
                                          {
                                            size: "sm",
                                            className: "h-7 px-2",
                                            onClick: () =>
                                              or.mutate({
                                                key: r.key,
                                                value: v.value,
                                              }),
                                            children: e.jsxDEV(
                                              ie,
                                              { className: "w-3 h-3" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1753,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1752,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          i,
                                          {
                                            size: "sm",
                                            variant: "ghost",
                                            className: "h-7 px-2",
                                            onClick: () => w(null),
                                            children: "✕",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1755,
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
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1745,
                                      columnNumber: 19,
                                    },
                                    this,
                                  )
                                : e.jsxDEV(
                                    "div",
                                    {
                                      className: "flex items-center gap-2",
                                      children: [
                                        e.jsxDEV(
                                          o,
                                          {
                                            variant: "outline",
                                            className: "font-mono",
                                            children: r.value,
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1759,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          i,
                                          {
                                            size: "sm",
                                            variant: "ghost",
                                            className: "h-7 px-2",
                                            onClick: () =>
                                              w({ key: r.key, value: r.value }),
                                            children: e.jsxDEV(
                                              es,
                                              { className: "w-3 h-3" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1760,
                                                columnNumber: 142,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1760,
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
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1758,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                            ],
                          },
                          r.key,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1739,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1737,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1732,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              l,
              {
                children: [
                  e.jsxDEV(
                    d,
                    {
                      children: [
                        e.jsxDEV(
                          N,
                          {
                            className: "flex items-center gap-2",
                            children: [
                              e.jsxDEV(
                                vr,
                                { className: "w-5 h-5" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1771,
                                  columnNumber: 60,
                                },
                                this,
                              ),
                              " Tax Treaty Withholding Rates",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1771,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          L,
                          {
                            children:
                              "US tax treaty withholding rates by country. Standard rate is 30% for non-treaty countries. Treaty rate = 0 means full exemption.",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1772,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1770,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    m,
                    {
                      children: e.jsxDEV(
                        fe,
                        {
                          children: [
                            e.jsxDEV(
                              ge,
                              {
                                children: e.jsxDEV(
                                  z,
                                  {
                                    children: [
                                      e.jsxDEV(
                                        h,
                                        { children: "Country" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1778,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        h,
                                        { children: "Code" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1779,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        h,
                                        { children: "Std Rate %" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1780,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        h,
                                        { children: "Treaty Rate %" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1781,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        h,
                                        { children: "Notes" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1782,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        h,
                                        { children: "Actions" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1783,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1777,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1776,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              ve,
                              {
                                children: lr?.treaties?.map((r) =>
                                  e.jsxDEV(
                                    z,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          p,
                                          {
                                            className: "font-medium",
                                            children: r.countryName,
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1789,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          p,
                                          {
                                            children: e.jsxDEV(
                                              o,
                                              {
                                                variant: "outline",
                                                children: r.countryCode,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1790,
                                                columnNumber: 32,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1790,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          p,
                                          {
                                            className: "font-mono",
                                            children: [r.withholdingRate, "%"],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1791,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          p,
                                          {
                                            children:
                                              I?.id === r.id &&
                                              I.field === "treatyRate"
                                                ? e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex items-center gap-2",
                                                      children: [
                                                        e.jsxDEV(
                                                          S,
                                                          {
                                                            className:
                                                              "w-16 h-7 text-xs",
                                                            type: "number",
                                                            step: "1",
                                                            min: "0",
                                                            max: "30",
                                                            value: I.value,
                                                            onChange: (k) =>
                                                              Z({
                                                                ...I,
                                                                value:
                                                                  k.target
                                                                    .value,
                                                              }),
                                                            autoFocus: !0,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 1795,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          i,
                                                          {
                                                            size: "sm",
                                                            className:
                                                              "h-7 px-2",
                                                            onClick: () =>
                                                              cr.mutate({
                                                                id: r.id,
                                                                field:
                                                                  "treatyRate",
                                                                value: I.value,
                                                              }),
                                                            children: e.jsxDEV(
                                                              ie,
                                                              {
                                                                className:
                                                                  "w-3 h-3",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                                lineNumber: 1806,
                                                                columnNumber: 29,
                                                              },
                                                              this,
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 1805,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          i,
                                                          {
                                                            size: "sm",
                                                            variant: "ghost",
                                                            className:
                                                              "h-7 px-2",
                                                            onClick: () =>
                                                              Z(null),
                                                            children: "✕",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                            lineNumber: 1808,
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
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1794,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  )
                                                : e.jsxDEV(
                                                    "span",
                                                    {
                                                      className: `font-mono font-semibold ${r.treatyRate === 0 ? "text-green-600" : "text-amber-600"}`,
                                                      children: [
                                                        r.treatyRate,
                                                        "%",
                                                      ],
                                                    },
                                                    void 0,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                      lineNumber: 1811,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1792,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          p,
                                          {
                                            className:
                                              "text-xs text-muted-foreground max-w-48 truncate",
                                            children: r.notes,
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1814,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          p,
                                          {
                                            children: e.jsxDEV(
                                              i,
                                              {
                                                size: "sm",
                                                variant: "outline",
                                                className: "h-7 text-xs",
                                                onClick: () =>
                                                  Z({
                                                    id: r.id,
                                                    field: "treatyRate",
                                                    value:
                                                      r.treatyRate.toString(),
                                                  }),
                                                children: "Edit Rate",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1816,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1815,
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
                                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                                      lineNumber: 1788,
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
                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                lineNumber: 1786,
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
                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                          lineNumber: 1775,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1774,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1769,
                columnNumber: 9,
              },
              this,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
          lineNumber: 1650,
          columnNumber: 7,
        },
        this,
      );
    },
    rr = () => {
      switch (ke) {
        case "overview":
          return _e();
        case "users":
          return Gs();
        case "moderation":
          return Ws();
        case "system":
          return Ys();
        case "analytics":
          return Xs();
        case "financial":
          return e.jsxDEV(
            sr,
            {},
            void 0,
            !1,
            {
              fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
              lineNumber: 1835,
              columnNumber: 32,
            },
            this,
          );
        case "killswitch":
          return Js();
        case "payment-bypass":
          return Zs();
        case "settings":
          return er();
        default:
          return _e();
      }
    };
  return e.jsxDEV(
    "div",
    {
      className: "flex min-h-screen",
      children: [
        _s(),
        e.jsxDEV(
          "div",
          { className: "flex-1 bg-gray-50 p-6 overflow-auto", children: rr() },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
            lineNumber: 1846,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          rs,
          {
            open: Vs,
            onOpenChange: _,
            children: e.jsxDEV(
              ns,
              {
                children: [
                  e.jsxDEV(
                    is,
                    {
                      children: [
                        e.jsxDEV(
                          ls,
                          { children: "Edit User" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1853,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          ms,
                          {
                            children: [
                              "Update settings for ",
                              V?.username || V?.email,
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1854,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1852,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "space-y-4 py-4",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            children: [
                              e.jsxDEV(
                                j,
                                { children: "Role" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1860,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                P,
                                {
                                  value: Se,
                                  onValueChange: Ce,
                                  children: [
                                    e.jsxDEV(
                                      U,
                                      {
                                        className: "mt-2",
                                        children: e.jsxDEV(
                                          T,
                                          {},
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1863,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1862,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      M,
                                      {
                                        children: [
                                          e.jsxDEV(
                                            t,
                                            { value: "user", children: "User" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1866,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            t,
                                            {
                                              value: "admin",
                                              children: "Admin",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1867,
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
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1865,
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
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1861,
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
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1859,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            children: [
                              e.jsxDEV(
                                j,
                                { children: "Subscription Plan" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1872,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                P,
                                {
                                  value: Re,
                                  onValueChange: Pe,
                                  children: [
                                    e.jsxDEV(
                                      U,
                                      {
                                        className: "mt-2",
                                        children: e.jsxDEV(
                                          T,
                                          {},
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1875,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1874,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      M,
                                      {
                                        children: [
                                          e.jsxDEV(
                                            t,
                                            { value: "free", children: "Free" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1878,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            t,
                                            {
                                              value: "monthly",
                                              children: "Monthly",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1879,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            t,
                                            {
                                              value: "yearly",
                                              children: "Yearly",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1880,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            t,
                                            {
                                              value: "lifetime",
                                              children: "Lifetime",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1881,
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
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1877,
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
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1873,
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
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1871,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            children: [
                              e.jsxDEV(
                                j,
                                { children: "Status" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1886,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                P,
                                {
                                  value: Ue,
                                  onValueChange: Te,
                                  children: [
                                    e.jsxDEV(
                                      U,
                                      {
                                        className: "mt-2",
                                        children: e.jsxDEV(
                                          T,
                                          {},
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                                            lineNumber: 1889,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1888,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      M,
                                      {
                                        children: [
                                          e.jsxDEV(
                                            t,
                                            {
                                              value: "active",
                                              children: "Active",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1892,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            t,
                                            {
                                              value: "inactive",
                                              children: "Inactive",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1893,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            t,
                                            {
                                              value: "suspended",
                                              children: "Suspended",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1894,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            t,
                                            {
                                              value: "banned",
                                              children: "Banned",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1895,
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
                                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                                        lineNumber: 1891,
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
                                    "/home/runner/workspace/client/src/pages/Admin.tsx",
                                  lineNumber: 1887,
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
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1885,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1858,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    as,
                    {
                      children: [
                        e.jsxDEV(
                          i,
                          {
                            variant: "outline",
                            onClick: () => _(!1),
                            children: "Cancel",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1901,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          i,
                          {
                            onClick: () => {
                              V &&
                                ce.mutate({
                                  userId: V.id,
                                  role: Se,
                                  subscriptionTier: Re,
                                  subscriptionStatus: Ue,
                                });
                            },
                            disabled: ce.isPending,
                            children: ce.isPending
                              ? "Saving..."
                              : "Save Changes",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1902,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1900,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1851,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
            lineNumber: 1850,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          ts,
          {
            open: ys,
            onOpenChange: le,
            children: e.jsxDEV(
              cs,
              {
                children: [
                  e.jsxDEV(
                    os,
                    {
                      children: [
                        e.jsxDEV(
                          us,
                          { children: "Delete User" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1924,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          ds,
                          {
                            children: [
                              'Are you sure you want to delete "',
                              V?.username || V?.email,
                              '"? This action cannot be undone.',
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1925,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1923,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    Ns,
                    {
                      children: [
                        e.jsxDEV(
                          hs,
                          { children: "Cancel" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1931,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          ps,
                          {
                            onClick: () => V && Is.mutate(V.id),
                            className: "bg-red-600 hover:bg-red-700",
                            children: "Delete User",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1932,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1930,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1922,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
            lineNumber: 1921,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          rs,
          {
            open: Ss,
            onOpenChange: G,
            children: e.jsxDEV(
              ns,
              {
                className: "max-w-lg",
                children: [
                  e.jsxDEV(
                    is,
                    {
                      children: [
                        e.jsxDEV(
                          ls,
                          { children: "Review Report" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1945,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          ms,
                          { children: "Take action on this moderation report" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1946,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1944,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  C &&
                    e.jsxDEV(
                      "div",
                      {
                        className: "space-y-4 py-4",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              className: "p-3 bg-gray-50 rounded-lg",
                              children: [
                                e.jsxDEV(
                                  "p",
                                  {
                                    className: "font-medium",
                                    children: C.contentTitle,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1953,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "p",
                                  {
                                    className: "text-sm text-gray-600",
                                    children: C.description,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1954,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex gap-2 mt-2",
                                    children: [
                                      e.jsxDEV(
                                        o,
                                        {
                                          variant: "outline",
                                          children: C.reason.replace("_", " "),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1956,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        o,
                                        {
                                          variant: "secondary",
                                          children: [
                                            "by ",
                                            C.reportedByUsername,
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1957,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1955,
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
                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                              lineNumber: 1952,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "div",
                            {
                              children: [
                                e.jsxDEV(
                                  j,
                                  { children: "Action" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1961,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  P,
                                  {
                                    value: X,
                                    onValueChange: Me,
                                    children: [
                                      e.jsxDEV(
                                        U,
                                        {
                                          className: "mt-2",
                                          children: e.jsxDEV(
                                            T,
                                            { placeholder: "Select action" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                                              lineNumber: 1964,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1963,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        M,
                                        {
                                          children: [
                                            e.jsxDEV(
                                              t,
                                              {
                                                value: "dismiss",
                                                children: "Dismiss Report",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1967,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              t,
                                              {
                                                value: "warn_user",
                                                children: "Warn User",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1968,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              t,
                                              {
                                                value: "remove_content",
                                                children: "Remove Content",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1969,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              t,
                                              {
                                                value: "ban_user",
                                                children: "Ban User",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Admin.tsx",
                                                lineNumber: 1970,
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
                                            "/home/runner/workspace/client/src/pages/Admin.tsx",
                                          lineNumber: 1966,
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
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1962,
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
                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                              lineNumber: 1960,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "div",
                            {
                              children: [
                                e.jsxDEV(
                                  j,
                                  { children: "Notes" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1975,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  xs,
                                  {
                                    value: Fe,
                                    onChange: (s) => Le(s.target.value),
                                    placeholder:
                                      "Add notes about this decision...",
                                    className: "mt-2",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Admin.tsx",
                                    lineNumber: 1976,
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
                                "/home/runner/workspace/client/src/pages/Admin.tsx",
                              lineNumber: 1974,
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
                          "/home/runner/workspace/client/src/pages/Admin.tsx",
                        lineNumber: 1951,
                        columnNumber: 13,
                      },
                      this,
                    ),
                  e.jsxDEV(
                    as,
                    {
                      children: [
                        e.jsxDEV(
                          i,
                          {
                            variant: "outline",
                            onClick: () => G(!1),
                            children: "Cancel",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1986,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          i,
                          {
                            onClick: () => {
                              C &&
                                X &&
                                oe.mutate({
                                  reportId: C.id,
                                  action: X,
                                  notes: Fe,
                                });
                            },
                            disabled: !X || oe.isPending,
                            children: oe.isPending
                              ? "Processing..."
                              : "Submit Review",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 1987,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 1985,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 1943,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
            lineNumber: 1942,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          ts,
          {
            open: Cs,
            onOpenChange: W,
            children: e.jsxDEV(
              cs,
              {
                children: [
                  e.jsxDEV(
                    os,
                    {
                      children: [
                        e.jsxDEV(
                          us,
                          {
                            children: n?.killSwitch?.globalKilled
                              ? "Resume Systems"
                              : "Emergency Stop",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 2008,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          ds,
                          {
                            children: n?.killSwitch?.globalKilled
                              ? "Provide a reason to resume all autonomous systems."
                              : "This will immediately stop all autonomous systems. Provide a reason for the emergency stop.",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 2011,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 2007,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "py-4",
                      children: [
                        e.jsxDEV(
                          j,
                          { children: "Reason (required)" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 2018,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          xs,
                          {
                            value: $,
                            onChange: (s) => Ke(s.target.value),
                            placeholder: "Enter reason for this action...",
                            className: "mt-2",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 2019,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 2017,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    Ns,
                    {
                      children: [
                        e.jsxDEV(
                          hs,
                          { children: "Cancel" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 2027,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          ps,
                          {
                            onClick: () => {
                              $.length >= 5 &&
                                (n?.killSwitch?.globalKilled
                                  ? zs.mutate($)
                                  : Os.mutate($));
                            },
                            disabled: $.length < 5,
                            className: n?.killSwitch?.globalKilled
                              ? ""
                              : "bg-red-600 hover:bg-red-700",
                            children: n?.killSwitch?.globalKilled
                              ? "Resume Systems"
                              : "Activate Kill Switch",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Admin.tsx",
                            lineNumber: 2028,
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
                        "/home/runner/workspace/client/src/pages/Admin.tsx",
                      lineNumber: 2026,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
                lineNumber: 2006,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
            lineNumber: 2005,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    !0,
    {
      fileName: "/home/runner/workspace/client/src/pages/Admin.tsx",
      lineNumber: 1844,
      columnNumber: 5,
    },
    this,
  );
}
export { $r as default };
