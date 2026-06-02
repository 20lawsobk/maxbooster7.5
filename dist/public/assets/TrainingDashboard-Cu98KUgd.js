import {
  ah as G,
  r as S,
  aH as E,
  aI as L,
  f as e,
  aL as D,
  a$ as U,
  bw as F,
  aJ as J,
  dV as $,
  aQ as Z,
  a_ as X,
  bf as M,
  dT as Y,
  cw as ee,
  cZ as ae,
  bC as se,
  bB as re,
  b$ as P,
} from "./vendor-react-31oK5L0i.js";
import { A } from "./AppLayout-D2pri0rw.js";
import {
  j as V,
  C as m,
  h as o,
  a4 as ie,
  a5 as ne,
  a6 as v,
  a9 as w,
  d as g,
  f as x,
  g as y,
  W as B,
  X as q,
  Y as z,
  Z as K,
  $ as T,
  P as O,
  B as _,
} from "./studio-DOUfHW5v.js";
import { A as R, f as H } from "./index-D5xLbTBZ.js";
import { b as te } from "./useRequireAuth-K5x5riUd.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./TopBar-jcH3P98k.js";
import "./vendor-animation-CFQslDag.js";
async function p(i, t) {
  const n = await fetch(i, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...t,
  });
  if (!n.ok) {
    const c = await n.json().catch(() => ({ error: n.statusText }));
    throw new Error(c.error || n.statusText);
  }
  return n.json();
}
function le(i) {
  const t = Math.floor(i / 3600),
    n = Math.floor((i % 3600) / 60),
    c = Math.floor(i % 60);
  return t > 0 ? `${t}h ${n}m` : n > 0 ? `${n}m ${c}s` : `${c}s`;
}
function Q({ status: i }) {
  const t = {
      idle: { label: "Idle", className: "bg-gray-500/20 text-gray-400" },
      running: {
        label: "Training",
        className: "bg-green-500/20 text-green-400 animate-pulse",
      },
      stopping: {
        label: "Stopping",
        className: "bg-yellow-500/20 text-yellow-400",
      },
      stopped: { label: "Stopped", className: "bg-blue-500/20 text-blue-400" },
      error: { label: "Error", className: "bg-red-500/20 text-red-400" },
    },
    { label: n, className: c } = t[i] ?? t.idle;
  return e.jsxDEV(
    "span",
    {
      className: `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c}`,
      children: [
        i === "running" &&
          e.jsxDEV(
            "span",
            { className: "w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
              lineNumber: 117,
              columnNumber: 32,
            },
            this,
          ),
        n,
      ],
    },
    void 0,
    !0,
    {
      fileName:
        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
      lineNumber: 116,
      columnNumber: 5,
    },
    this,
  );
}
function me({ history: i }) {
  if (i.length < 2)
    return e.jsxDEV(
      "div",
      {
        className:
          "flex items-center justify-center h-24 text-gray-500 text-xs",
        children: "No loss data yet — start training to see the curve",
      },
      void 0,
      !1,
      {
        fileName:
          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
        lineNumber: 126,
        columnNumber: 7,
      },
      this,
    );
  const t = Math.max(...i.map((r) => r.loss)),
    n = Math.min(...i.map((r) => r.loss)),
    c = t - n || 1,
    d = 400,
    h = 80,
    a = 4,
    k = i
      .map((r, u) => {
        const N = a + (u / (i.length - 1)) * (d - a * 2),
          b = a + (1 - (r.loss - n) / c) * (h - a * 2);
        return `${N},${b}`;
      })
      .join(" ");
  return e.jsxDEV(
    "div",
    {
      className: "w-full overflow-hidden",
      children: e.jsxDEV(
        "svg",
        {
          viewBox: `0 0 ${d} ${h}`,
          className: "w-full h-20",
          children: [
            e.jsxDEV(
              "defs",
              {
                children: e.jsxDEV(
                  "linearGradient",
                  {
                    id: "lossGrad",
                    x1: "0",
                    y1: "0",
                    x2: "0",
                    y2: "1",
                    children: [
                      e.jsxDEV(
                        "stop",
                        {
                          offset: "0%",
                          stopColor: "#6366f1",
                          stopOpacity: "0.3",
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                          lineNumber: 148,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "stop",
                        {
                          offset: "100%",
                          stopColor: "#6366f1",
                          stopOpacity: "0",
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                          lineNumber: 149,
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
                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                    lineNumber: 147,
                    columnNumber: 11,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                lineNumber: 146,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              "polyline",
              {
                points: k,
                fill: "none",
                stroke: "#6366f1",
                strokeWidth: "2",
                strokeLinecap: "round",
                strokeLinejoin: "round",
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                lineNumber: 152,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              "text",
              {
                x: a,
                y: h - 2,
                fontSize: "8",
                fill: "#6b7280",
                children: ["s", i[0].session],
              },
              void 0,
              !0,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                lineNumber: 160,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              "text",
              {
                x: d - a - 20,
                y: h - 2,
                fontSize: "8",
                fill: "#6b7280",
                children: ["s", i[i.length - 1].session],
              },
              void 0,
              !0,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                lineNumber: 163,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              "text",
              {
                x: a,
                y: 10,
                fontSize: "8",
                fill: "#6b7280",
                children: t.toFixed(4),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                lineNumber: 166,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              "text",
              {
                x: a,
                y: h - 12,
                fontSize: "8",
                fill: "#6b7280",
                children: n.toFixed(4),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                lineNumber: 169,
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
            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
          lineNumber: 145,
          columnNumber: 7,
        },
        this,
      ),
    },
    void 0,
    !1,
    {
      fileName:
        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
      lineNumber: 144,
      columnNumber: 5,
    },
    this,
  );
}
function fe() {
  const { isLoading: i } = te(),
    t = G(),
    [n, c] = S.useState("session"),
    [d, h] = S.useState(3),
    { data: a, isError: k } = E({
      queryKey: ["training-status"],
      queryFn: () => p("/api/training/status"),
      refetchInterval: (s) =>
        s.state.data?.status === "running" ||
        s.state.data?.status === "stopping"
          ? 3e3
          : 15e3,
      retry: !1,
    }),
    { data: r } = E({
      queryKey: ["training-datasets"],
      queryFn: () => p("/api/training/datasets"),
      staleTime: 6e4,
      retry: !1,
    }),
    { data: u } = E({
      queryKey: ["training-schedule"],
      queryFn: () => p("/api/training/schedule"),
      staleTime: 3e5,
      retry: !1,
    }),
    N = L({
      mutationFn: () =>
        p("/api/training/start", {
          method: "POST",
          body: JSON.stringify({ mode: n, n_sessions: d }),
        }),
      onSuccess: () => t.invalidateQueries({ queryKey: ["training-status"] }),
    }),
    b = L({
      mutationFn: () => p("/api/training/stop", { method: "POST" }),
      onSuccess: () => t.invalidateQueries({ queryKey: ["training-status"] }),
    }),
    C = a?.status === "running",
    I = a?.status === "stopping",
    j = !C && !I;
  return i
    ? e.jsxDEV(
        A,
        {
          children: e.jsxDEV(
            "div",
            {
              className: "flex items-center justify-center h-64",
              children: e.jsxDEV(
                D,
                { className: "w-6 h-6 animate-spin text-gray-400" },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                  lineNumber: 228,
                  columnNumber: 11,
                },
                this,
              ),
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
              lineNumber: 227,
              columnNumber: 9,
            },
            this,
          ),
        },
        void 0,
        !1,
        {
          fileName:
            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
          lineNumber: 226,
          columnNumber: 7,
        },
        this,
      )
    : e.jsxDEV(
        A,
        {
          children: e.jsxDEV(
            "div",
            {
              className: "max-w-6xl mx-auto px-4 py-6 space-y-6",
              children: [
                e.jsxDEV(
                  "div",
                  {
                    className: "flex items-center justify-between",
                    children: [
                      e.jsxDEV(
                        "div",
                        {
                          className: "flex items-center gap-3",
                          children: [
                            e.jsxDEV(
                              U,
                              { className: "w-7 h-7 text-indigo-400" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                lineNumber: 241,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                children: [
                                  e.jsxDEV(
                                    "h1",
                                    {
                                      className:
                                        "text-xl font-semibold text-white",
                                      children: "Model Training",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                      lineNumber: 243,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className: "text-sm text-gray-400",
                                      children:
                                        "UNetV4 · 463M params · 30-day curriculum",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
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
                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                lineNumber: 242,
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
                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                          lineNumber: 240,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "div",
                        {
                          className: "flex items-center gap-2",
                          children: [
                            a &&
                              e.jsxDEV(
                                Q,
                                { status: a.status },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                  lineNumber: 250,
                                  columnNumber: 24,
                                },
                                this,
                              ),
                            e.jsxDEV(
                              V,
                              {
                                variant: "ghost",
                                size: "sm",
                                onClick: () =>
                                  t.invalidateQueries({
                                    queryKey: ["training-status"],
                                  }),
                                className: "text-gray-400",
                                children: e.jsxDEV(
                                  D,
                                  { className: "w-4 h-4" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 257,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                lineNumber: 251,
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
                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                          lineNumber: 249,
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
                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                    lineNumber: 239,
                    columnNumber: 9,
                  },
                  this,
                ),
                a?.error &&
                  e.jsxDEV(
                    R,
                    {
                      className: "border-red-500/30 bg-red-500/10",
                      children: [
                        e.jsxDEV(
                          F,
                          { className: "w-4 h-4 text-red-400" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                            lineNumber: 265,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          H,
                          {
                            className: "text-red-300 text-sm",
                            children: a.error,
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                            lineNumber: 266,
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
                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                      lineNumber: 264,
                      columnNumber: 11,
                    },
                    this,
                  ),
                k &&
                  e.jsxDEV(
                    R,
                    {
                      className: "border-yellow-500/30 bg-yellow-500/10",
                      children: [
                        e.jsxDEV(
                          F,
                          { className: "w-4 h-4 text-yellow-400" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                            lineNumber: 274,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          H,
                          {
                            className: "text-yellow-300 text-sm",
                            children:
                              "Python AI service unavailable — make sure the server is running.",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                            lineNumber: 275,
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
                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                      lineNumber: 273,
                      columnNumber: 11,
                    },
                    this,
                  ),
                e.jsxDEV(
                  "div",
                  {
                    className: "grid grid-cols-2 md:grid-cols-4 gap-4",
                    children: [
                      e.jsxDEV(
                        m,
                        {
                          className: "bg-gray-900 border-gray-700",
                          children: e.jsxDEV(
                            o,
                            {
                              className: "pt-4 pb-3",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex items-center gap-2 mb-1",
                                    children: [
                                      e.jsxDEV(
                                        J,
                                        {
                                          className: "w-4 h-4 text-indigo-400",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 286,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "span",
                                        {
                                          className:
                                            "text-xs text-gray-400 uppercase tracking-wide",
                                          children: "Phase",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 287,
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
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 285,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-2xl font-bold text-white",
                                    children: [
                                      a?.phase ?? "—",
                                      e.jsxDEV(
                                        "span",
                                        {
                                          className: "text-gray-500 text-sm",
                                          children: "/4",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 290,
                                          columnNumber: 39,
                                        },
                                        this,
                                      ),
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 289,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "text-xs text-gray-400 mt-0.5 truncate",
                                    children: a?.phase_name || "Not started",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 292,
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
                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                              lineNumber: 284,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                          lineNumber: 283,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        m,
                        {
                          className: "bg-gray-900 border-gray-700",
                          children: e.jsxDEV(
                            o,
                            {
                              className: "pt-4 pb-3",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex items-center gap-2 mb-1",
                                    children: [
                                      e.jsxDEV(
                                        $,
                                        { className: "w-4 h-4 text-green-400" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 301,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "span",
                                        {
                                          className:
                                            "text-xs text-gray-400 uppercase tracking-wide",
                                          children: "Loss",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 302,
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
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 300,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-2xl font-bold text-white",
                                    children:
                                      a?.loss != null ? a.loss.toFixed(4) : "—",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 304,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-xs text-gray-400 mt-0.5",
                                    children: [
                                      a?.session_count ?? 0,
                                      " sessions completed",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 307,
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
                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                              lineNumber: 299,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                          lineNumber: 298,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        m,
                        {
                          className: "bg-gray-900 border-gray-700",
                          children: e.jsxDEV(
                            o,
                            {
                              className: "pt-4 pb-3",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex items-center gap-2 mb-1",
                                    children: [
                                      e.jsxDEV(
                                        Z,
                                        { className: "w-4 h-4 text-blue-400" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 316,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "span",
                                        {
                                          className:
                                            "text-xs text-gray-400 uppercase tracking-wide",
                                          children: "Samples",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 317,
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
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 315,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-2xl font-bold text-white",
                                    children:
                                      a?.total_samples != null
                                        ? a.total_samples >= 1e3
                                          ? `${(a.total_samples / 1e3).toFixed(1)}K`
                                          : a.total_samples
                                        : "—",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 319,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-xs text-gray-400 mt-0.5",
                                    children: "total trained",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
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
                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                              lineNumber: 314,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                          lineNumber: 313,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        m,
                        {
                          className: "bg-gray-900 border-gray-700",
                          children: e.jsxDEV(
                            o,
                            {
                              className: "pt-4 pb-3",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex items-center gap-2 mb-1",
                                    children: [
                                      e.jsxDEV(
                                        X,
                                        {
                                          className: "w-4 h-4 text-purple-400",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 333,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "span",
                                        {
                                          className:
                                            "text-xs text-gray-400 uppercase tracking-wide",
                                          children: "Time",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 334,
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
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 332,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-2xl font-bold text-white",
                                    children: a?.elapsed_sec
                                      ? le(a.elapsed_sec)
                                      : "—",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 336,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-xs text-gray-400 mt-0.5",
                                    children: "training time",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 339,
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
                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                              lineNumber: 331,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                          lineNumber: 330,
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
                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                    lineNumber: 282,
                    columnNumber: 9,
                  },
                  this,
                ),
                e.jsxDEV(
                  ie,
                  {
                    defaultValue: "control",
                    className: "space-y-4",
                    children: [
                      e.jsxDEV(
                        ne,
                        {
                          className: "bg-gray-800 border border-gray-700",
                          children: [
                            e.jsxDEV(
                              v,
                              {
                                value: "control",
                                className: "data-[state=active]:bg-gray-700",
                                children: [
                                  e.jsxDEV(
                                    M,
                                    { className: "w-3.5 h-3.5 mr-1.5" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                      lineNumber: 347,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  "Control",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                lineNumber: 346,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              v,
                              {
                                value: "loss",
                                className: "data-[state=active]:bg-gray-700",
                                children: [
                                  e.jsxDEV(
                                    Y,
                                    { className: "w-3.5 h-3.5 mr-1.5" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                      lineNumber: 350,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  "Loss Curve",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                lineNumber: 349,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              v,
                              {
                                value: "datasets",
                                className: "data-[state=active]:bg-gray-700",
                                children: [
                                  e.jsxDEV(
                                    ee,
                                    { className: "w-3.5 h-3.5 mr-1.5" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                      lineNumber: 353,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  "Datasets",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                lineNumber: 352,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              v,
                              {
                                value: "schedule",
                                className: "data-[state=active]:bg-gray-700",
                                children: [
                                  e.jsxDEV(
                                    ae,
                                    { className: "w-3.5 h-3.5 mr-1.5" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                      lineNumber: 356,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  "Curriculum",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                lineNumber: 355,
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
                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                          lineNumber: 345,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        w,
                        {
                          value: "control",
                          className: "space-y-4",
                          children: [
                            e.jsxDEV(
                              "div",
                              {
                                className:
                                  "grid grid-cols-1 md:grid-cols-2 gap-4",
                                children: [
                                  e.jsxDEV(
                                    m,
                                    {
                                      className: "bg-gray-900 border-gray-700",
                                      children: [
                                        e.jsxDEV(
                                          g,
                                          {
                                            className: "pb-3",
                                            children: [
                                              e.jsxDEV(
                                                x,
                                                {
                                                  className:
                                                    "text-white text-sm font-medium",
                                                  children: "Start Training",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                  lineNumber: 365,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                y,
                                                {
                                                  className:
                                                    "text-gray-400 text-xs",
                                                  children:
                                                    "Runs the curriculum trainer which automatically advances through phases",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                  lineNumber: 366,
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
                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                            lineNumber: 364,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          o,
                                          {
                                            className: "space-y-4",
                                            children: [
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "grid grid-cols-2 gap-3",
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        children: [
                                                          e.jsxDEV(
                                                            "label",
                                                            {
                                                              className:
                                                                "text-xs text-gray-400 block mb-1.5",
                                                              children: "Mode",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                              lineNumber: 373,
                                                              columnNumber: 23,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            B,
                                                            {
                                                              value: n,
                                                              onValueChange: (
                                                                s,
                                                              ) => c(s),
                                                              disabled: !j,
                                                              children: [
                                                                e.jsxDEV(
                                                                  q,
                                                                  {
                                                                    className:
                                                                      "bg-gray-800 border-gray-600 text-gray-200 text-sm h-8",
                                                                    children:
                                                                      e.jsxDEV(
                                                                        z,
                                                                        {},
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                          lineNumber: 380,
                                                                          columnNumber: 27,
                                                                        },
                                                                        this,
                                                                      ),
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                    lineNumber: 379,
                                                                    columnNumber: 25,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  K,
                                                                  {
                                                                    className:
                                                                      "bg-gray-800 border-gray-600",
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        T,
                                                                        {
                                                                          value:
                                                                            "session",
                                                                          className:
                                                                            "text-gray-200 text-sm",
                                                                          children:
                                                                            "Single Session",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                          lineNumber: 383,
                                                                          columnNumber: 27,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        T,
                                                                        {
                                                                          value:
                                                                            "day",
                                                                          className:
                                                                            "text-gray-200 text-sm",
                                                                          children:
                                                                            [
                                                                              "Day (",
                                                                              d,
                                                                              " sessions)",
                                                                            ],
                                                                        },
                                                                        void 0,
                                                                        !0,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                          lineNumber: 386,
                                                                          columnNumber: 27,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        T,
                                                                        {
                                                                          value:
                                                                            "continuous",
                                                                          className:
                                                                            "text-gray-200 text-sm",
                                                                          children:
                                                                            "Continuous (until stopped)",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                          lineNumber: 389,
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
                                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                    lineNumber: 382,
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
                                                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                              lineNumber: 374,
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
                                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                        lineNumber: 372,
                                                        columnNumber: 21,
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
                                                              className:
                                                                "text-xs text-gray-400 block mb-1.5",
                                                              children:
                                                                "Sessions (Day mode)",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                              lineNumber: 396,
                                                              columnNumber: 23,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            B,
                                                            {
                                                              value: String(d),
                                                              onValueChange: (
                                                                s,
                                                              ) => h(Number(s)),
                                                              disabled:
                                                                !j ||
                                                                n !== "day",
                                                              children: [
                                                                e.jsxDEV(
                                                                  q,
                                                                  {
                                                                    className:
                                                                      "bg-gray-800 border-gray-600 text-gray-200 text-sm h-8",
                                                                    children:
                                                                      e.jsxDEV(
                                                                        z,
                                                                        {},
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                          lineNumber: 403,
                                                                          columnNumber: 27,
                                                                        },
                                                                        this,
                                                                      ),
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                    lineNumber: 402,
                                                                    columnNumber: 25,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  K,
                                                                  {
                                                                    className:
                                                                      "bg-gray-800 border-gray-600",
                                                                    children: [
                                                                      1, 2, 3,
                                                                      5, 10,
                                                                    ].map((s) =>
                                                                      e.jsxDEV(
                                                                        T,
                                                                        {
                                                                          value:
                                                                            String(
                                                                              s,
                                                                            ),
                                                                          className:
                                                                            "text-gray-200 text-sm",
                                                                          children:
                                                                            s,
                                                                        },
                                                                        s,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                          lineNumber: 407,
                                                                          columnNumber: 29,
                                                                        },
                                                                        this,
                                                                      ),
                                                                    ),
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                    lineNumber: 405,
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
                                                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                              lineNumber: 397,
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
                                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                        lineNumber: 395,
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
                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                  lineNumber: 371,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className: "flex gap-2",
                                                  children: [
                                                    e.jsxDEV(
                                                      V,
                                                      {
                                                        className:
                                                          "flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm",
                                                        disabled:
                                                          !j || N.isPending,
                                                        onClick: () =>
                                                          N.mutate(),
                                                        children: N.isPending
                                                          ? e.jsxDEV(
                                                              e.Fragment,
                                                              {
                                                                children: [
                                                                  e.jsxDEV(
                                                                    D,
                                                                    {
                                                                      className:
                                                                        "w-3.5 h-3.5 mr-1.5 animate-spin",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                      lineNumber: 423,
                                                                      columnNumber: 29,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  "Starting…",
                                                                ],
                                                              },
                                                              void 0,
                                                              !0,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                lineNumber: 423,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            )
                                                          : e.jsxDEV(
                                                              e.Fragment,
                                                              {
                                                                children: [
                                                                  e.jsxDEV(
                                                                    M,
                                                                    {
                                                                      className:
                                                                        "w-3.5 h-3.5 mr-1.5",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                      lineNumber: 424,
                                                                      columnNumber: 29,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  "Start Training",
                                                                ],
                                                              },
                                                              void 0,
                                                              !0,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                lineNumber: 424,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            ),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                        lineNumber: 417,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      V,
                                                      {
                                                        variant: "outline",
                                                        className:
                                                          "border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm",
                                                        disabled:
                                                          !C || b.isPending,
                                                        onClick: () =>
                                                          b.mutate(),
                                                        children: b.isPending
                                                          ? e.jsxDEV(
                                                              D,
                                                              {
                                                                className:
                                                                  "w-3.5 h-3.5 animate-spin",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                lineNumber: 434,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            )
                                                          : e.jsxDEV(
                                                              se,
                                                              {
                                                                className:
                                                                  "w-3.5 h-3.5",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                lineNumber: 435,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            ),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                        lineNumber: 427,
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
                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                  lineNumber: 416,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              N.isError &&
                                                e.jsxDEV(
                                                  "p",
                                                  {
                                                    className:
                                                      "text-red-400 text-xs",
                                                    children: N.error.message,
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
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
                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                            lineNumber: 370,
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
                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                      lineNumber: 363,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    m,
                                    {
                                      className: "bg-gray-900 border-gray-700",
                                      children: [
                                        e.jsxDEV(
                                          g,
                                          {
                                            className: "pb-3",
                                            children: e.jsxDEV(
                                              x,
                                              {
                                                className:
                                                  "text-white text-sm font-medium",
                                                children: "Current Session",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                lineNumber: 448,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                            lineNumber: 447,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          o,
                                          {
                                            className: "space-y-3",
                                            children: e.jsxDEV(
                                              "div",
                                              {
                                                className: "space-y-2 text-sm",
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex justify-between text-gray-300",
                                                      children: [
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "text-gray-400",
                                                            children: "Status",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                            lineNumber: 453,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        a
                                                          ? e.jsxDEV(
                                                              Q,
                                                              {
                                                                status:
                                                                  a.status,
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                lineNumber: 454,
                                                                columnNumber: 33,
                                                              },
                                                              this,
                                                            )
                                                          : e.jsxDEV(
                                                              "span",
                                                              {
                                                                className:
                                                                  "text-gray-500",
                                                                children: "—",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                lineNumber: 454,
                                                                columnNumber: 74,
                                                              },
                                                              this,
                                                            ),
                                                      ],
                                                    },
                                                    void 0,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                      lineNumber: 452,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex justify-between text-gray-300",
                                                      children: [
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "text-gray-400",
                                                            children: "Phase",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                            lineNumber: 457,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            children: a?.phase
                                                              ? `${a.phase} — ${a.phase_name}`
                                                              : "—",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                            lineNumber: 458,
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
                                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                      lineNumber: 456,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex justify-between text-gray-300",
                                                      children: [
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "text-gray-400",
                                                            children:
                                                              "Current Loss",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                            lineNumber: 461,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "font-mono text-green-400",
                                                            children:
                                                              a?.loss != null
                                                                ? a.loss.toFixed(
                                                                    5,
                                                                  )
                                                                : "—",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                            lineNumber: 462,
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
                                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                      lineNumber: 460,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex justify-between text-gray-300",
                                                      children: [
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "text-gray-400",
                                                            children:
                                                              "Sessions Done",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                            lineNumber: 467,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            children:
                                                              a?.session_count ??
                                                              0,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                            lineNumber: 468,
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
                                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                      lineNumber: 466,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex justify-between text-gray-300",
                                                      children: [
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "text-gray-400",
                                                            children:
                                                              "Last Weights Save",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                            lineNumber: 471,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "text-xs",
                                                            children:
                                                              a?.last_save
                                                                ? new Date(
                                                                    a.last_save *
                                                                      1e3,
                                                                  ).toLocaleTimeString()
                                                                : "—",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                            lineNumber: 472,
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
                                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                      lineNumber: 470,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex justify-between text-gray-300",
                                                      children: [
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "text-gray-400",
                                                            children:
                                                              "Weights File",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                            lineNumber: 479,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "text-xs text-gray-500 truncate max-w-[140px]",
                                                            children:
                                                              a?.weights_path
                                                                ? a.weights_path
                                                                    .split("/")
                                                                    .pop()
                                                                : "weights_v4.npz",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                            lineNumber: 480,
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
                                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                      lineNumber: 478,
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
                                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                lineNumber: 451,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                            lineNumber: 450,
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
                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                      lineNumber: 446,
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
                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                lineNumber: 362,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            u?.current_status &&
                              e.jsxDEV(
                                m,
                                {
                                  className: "bg-gray-900 border-gray-700",
                                  children: e.jsxDEV(
                                    o,
                                    {
                                      className: "pt-4",
                                      children: [
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "flex items-center justify-between mb-2",
                                            children: [
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className:
                                                    "text-sm text-gray-300",
                                                  children:
                                                    "30-Day Curriculum Progress",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                  lineNumber: 496,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className:
                                                    "text-xs text-gray-400",
                                                  children: [
                                                    "Day ",
                                                    u.current_status
                                                      .current_day,
                                                    " / 30",
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                  lineNumber: 499,
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
                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                            lineNumber: 495,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          O,
                                          {
                                            value:
                                              u.current_status.progress_pct ??
                                              0,
                                            className: "h-2",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                            lineNumber: 503,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "p",
                                          {
                                            className:
                                              "text-xs text-gray-500 mt-1.5",
                                            children: [
                                              "Phase ",
                                              u.current_status.current_phase,
                                              ": ",
                                              u.current_status.phase_name,
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                            lineNumber: 507,
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
                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                      lineNumber: 494,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                  lineNumber: 493,
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
                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                          lineNumber: 361,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        w,
                        {
                          value: "loss",
                          children: e.jsxDEV(
                            m,
                            {
                              className: "bg-gray-900 border-gray-700",
                              children: [
                                e.jsxDEV(
                                  g,
                                  {
                                    className: "pb-3",
                                    children: [
                                      e.jsxDEV(
                                        x,
                                        {
                                          className:
                                            "text-white text-sm font-medium flex items-center gap-2",
                                          children: [
                                            e.jsxDEV(
                                              $,
                                              {
                                                className:
                                                  "w-4 h-4 text-green-400",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                lineNumber: 520,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            "Training Loss History",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 519,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        y,
                                        {
                                          className: "text-gray-400 text-xs",
                                          children: [
                                            a?.loss_history?.length ?? 0,
                                            " data points across ",
                                            a?.session_count ?? 0,
                                            " sessions",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 523,
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
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 518,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  o,
                                  {
                                    children: [
                                      e.jsxDEV(
                                        me,
                                        { history: a?.loss_history ?? [] },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 528,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      a?.loss_history &&
                                        a.loss_history.length > 0 &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "mt-4 grid grid-cols-3 gap-3 text-center text-xs",
                                            children: [
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "bg-gray-800 rounded p-2",
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "text-gray-400 mb-1",
                                                        children: "First Loss",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                        lineNumber: 533,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "text-white font-mono",
                                                        children:
                                                          a.loss_history[0].loss.toFixed(
                                                            4,
                                                          ),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                        lineNumber: 534,
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
                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                  lineNumber: 532,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "bg-gray-800 rounded p-2",
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "text-gray-400 mb-1",
                                                        children: "Best Loss",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                        lineNumber: 539,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "text-green-400 font-mono",
                                                        children: Math.min(
                                                          ...a.loss_history.map(
                                                            (s) => s.loss,
                                                          ),
                                                        ).toFixed(4),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                        lineNumber: 540,
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
                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                  lineNumber: 538,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "bg-gray-800 rounded p-2",
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "text-gray-400 mb-1",
                                                        children: "Latest Loss",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                        lineNumber: 545,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "text-indigo-400 font-mono",
                                                        children:
                                                          a.loss_history[
                                                            a.loss_history
                                                              .length - 1
                                                          ].loss.toFixed(4),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                        lineNumber: 546,
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
                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                  lineNumber: 544,
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
                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                            lineNumber: 531,
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
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 527,
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
                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                              lineNumber: 517,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                          lineNumber: 516,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        w,
                        {
                          value: "datasets",
                          children: e.jsxDEV(
                            "div",
                            {
                              className: "space-y-4",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "grid grid-cols-2 md:grid-cols-3 gap-3",
                                    children: [
                                      {
                                        label: "HMDB-51 Clips",
                                        value: r?.stats?.hmdb51_clips,
                                        icon: "🎬",
                                        color: "text-blue-400",
                                      },
                                      {
                                        label: "UCF-101 Clips",
                                        value: r?.stats?.ucf101_clips,
                                        icon: "🎬",
                                        color: "text-blue-400",
                                      },
                                      {
                                        label: "MusicCaps Captions",
                                        value: r?.stats?.musiccaps_captions,
                                        icon: "🎵",
                                        color: "text-purple-400",
                                      },
                                      {
                                        label: "AudioCaps Captions",
                                        value: r?.stats?.audiocaps_captions,
                                        icon: "🔊",
                                        color: "text-teal-400",
                                      },
                                      {
                                        label: "FMA Tracks",
                                        value: r?.stats?.fma_tracks,
                                        icon: "🎼",
                                        color: "text-orange-400",
                                      },
                                      {
                                        label: "Total Disk Used",
                                        value:
                                          r?.total_gb != null
                                            ? `${r.total_gb} GB`
                                            : null,
                                        icon: "💾",
                                        color: "text-gray-300",
                                      },
                                    ].map(
                                      ({
                                        label: s,
                                        value: l,
                                        icon: f,
                                        color: W,
                                      }) =>
                                        e.jsxDEV(
                                          m,
                                          {
                                            className:
                                              "bg-gray-900 border-gray-700",
                                            children: e.jsxDEV(
                                              o,
                                              {
                                                className: "pt-3 pb-3",
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "text-lg mb-0.5",
                                                      children: f,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                      lineNumber: 570,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className: `text-xl font-bold ${W}`,
                                                      children:
                                                        l != null
                                                          ? typeof l == "number"
                                                            ? l.toLocaleString()
                                                            : l
                                                          : e.jsxDEV(
                                                              "span",
                                                              {
                                                                className:
                                                                  "text-gray-600",
                                                                children: "—",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                lineNumber: 576,
                                                                columnNumber: 29,
                                                              },
                                                              this,
                                                            ),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                      lineNumber: 571,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "text-xs text-gray-400 mt-0.5",
                                                      children: s,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                      lineNumber: 578,
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
                                                  "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                lineNumber: 569,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                          },
                                          s,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                            lineNumber: 568,
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
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 559,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  m,
                                  {
                                    className: "bg-gray-900 border-gray-700",
                                    children: [
                                      e.jsxDEV(
                                        g,
                                        {
                                          className: "pb-2",
                                          children: e.jsxDEV(
                                            x,
                                            {
                                              className:
                                                "text-sm font-medium text-white flex items-center gap-2",
                                              children: [
                                                e.jsxDEV(
                                                  re,
                                                  {
                                                    className:
                                                      "w-4 h-4 text-gray-400",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                    lineNumber: 587,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                "Dataset Sizes on Disk",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                              lineNumber: 586,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 585,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        o,
                                        {
                                          children:
                                            r?.disk_gb &&
                                            Object.keys(r.disk_gb).length > 0
                                              ? e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "space-y-2",
                                                    children: Object.entries(
                                                      r.disk_gb,
                                                    )
                                                      .filter(([, s]) => s > 0)
                                                      .sort(
                                                        ([, s], [, l]) => l - s,
                                                      )
                                                      .map(([s, l]) =>
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "flex items-center gap-3",
                                                            children: [
                                                              e.jsxDEV(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "text-xs text-gray-400 w-32 truncate",
                                                                  children: s,
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                  lineNumber: 599,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "div",
                                                                {
                                                                  className:
                                                                    "flex-1",
                                                                  children:
                                                                    e.jsxDEV(
                                                                      O,
                                                                      {
                                                                        value:
                                                                          Math.min(
                                                                            100,
                                                                            (l /
                                                                              (r.total_gb ||
                                                                                1)) *
                                                                              100,
                                                                          ),
                                                                        className:
                                                                          "h-1.5",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                        lineNumber: 601,
                                                                        columnNumber: 31,
                                                                      },
                                                                      this,
                                                                    ),
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                  lineNumber: 600,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "text-xs text-gray-300 w-14 text-right",
                                                                  children: [
                                                                    l.toFixed(
                                                                      2,
                                                                    ),
                                                                    " GB",
                                                                  ],
                                                                },
                                                                void 0,
                                                                !0,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                  lineNumber: 606,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                            ],
                                                          },
                                                          s,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                            lineNumber: 598,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                      ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                    lineNumber: 593,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                )
                                              : e.jsxDEV(
                                                  "p",
                                                  {
                                                    className:
                                                      "text-sm text-gray-500 text-center py-4",
                                                    children:
                                                      "Loading dataset info…",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                    lineNumber: 613,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 591,
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
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 584,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  m,
                                  {
                                    className: "bg-gray-900 border-gray-700",
                                    children: e.jsxDEV(
                                      o,
                                      {
                                        className: "pt-4",
                                        children: [
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "flex items-center gap-2 mb-3",
                                              children: [
                                                e.jsxDEV(
                                                  P,
                                                  {
                                                    className: `w-4 h-4 ${r?.stats?.has_video_data ? "text-green-400" : "text-gray-600"}`,
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                    lineNumber: 623,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "span",
                                                  {
                                                    className:
                                                      "text-sm text-gray-300",
                                                    children: [
                                                      "Real video frames (",
                                                      r?.stats?.has_video_data
                                                        ? "active — 25% of training samples"
                                                        : "not yet available",
                                                      ")",
                                                    ],
                                                  },
                                                  void 0,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                    lineNumber: 624,
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
                                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                              lineNumber: 622,
                                              columnNumber: 19,
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
                                                  P,
                                                  {
                                                    className: `w-4 h-4 ${r?.stats?.has_prompt_data ? "text-green-400" : "text-gray-600"}`,
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                    lineNumber: 629,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "span",
                                                  {
                                                    className:
                                                      "text-sm text-gray-300",
                                                    children: [
                                                      "Real music captions (",
                                                      r?.stats?.has_prompt_data
                                                        ? "active — 20% of training prompts"
                                                        : "not yet available",
                                                      ")",
                                                    ],
                                                  },
                                                  void 0,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                    lineNumber: 630,
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
                                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                              lineNumber: 628,
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
                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                        lineNumber: 621,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 620,
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
                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                              lineNumber: 558,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                          lineNumber: 557,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        w,
                        {
                          value: "schedule",
                          children: e.jsxDEV(
                            m,
                            {
                              className: "bg-gray-900 border-gray-700",
                              children: [
                                e.jsxDEV(
                                  g,
                                  {
                                    className: "pb-3",
                                    children: [
                                      e.jsxDEV(
                                        x,
                                        {
                                          className:
                                            "text-white text-sm font-medium",
                                          children:
                                            "30-Day Training Curriculum",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 643,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        y,
                                        {
                                          className: "text-gray-400 text-xs",
                                          children:
                                            "Automatic phase progression based on loss targets",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                          lineNumber: 644,
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
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 642,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  o,
                                  {
                                    children: u?.schedule
                                      ? e.jsxDEV(
                                          "div",
                                          {
                                            className: "space-y-3",
                                            children: u.schedule.map((s) => {
                                              const l =
                                                s.phase_id ===
                                                u.current_status?.current_phase;
                                              return e.jsxDEV(
                                                "div",
                                                {
                                                  className: `rounded-lg p-3 border ${l ? "border-indigo-500/50 bg-indigo-500/10" : "border-gray-700 bg-gray-800/50"}`,
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center justify-between mb-1",
                                                        children: [
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "flex items-center gap-2",
                                                              children: [
                                                                l &&
                                                                  e.jsxDEV(
                                                                    "span",
                                                                    {
                                                                      className:
                                                                        "w-2 h-2 rounded-full bg-indigo-400 animate-pulse",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                      lineNumber: 665,
                                                                      columnNumber: 33,
                                                                    },
                                                                    this,
                                                                  ),
                                                                e.jsxDEV(
                                                                  "span",
                                                                  {
                                                                    className:
                                                                      "text-sm font-medium text-white",
                                                                    children: [
                                                                      "Phase ",
                                                                      s.phase_id,
                                                                      ": ",
                                                                      s.name,
                                                                    ],
                                                                  },
                                                                  void 0,
                                                                  !0,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                    lineNumber: 667,
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
                                                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                              lineNumber: 663,
                                                              columnNumber: 29,
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
                                                                  _,
                                                                  {
                                                                    variant:
                                                                      "outline",
                                                                    className:
                                                                      "text-xs border-gray-600 text-gray-400",
                                                                    children: [
                                                                      "T=",
                                                                      s.T,
                                                                    ],
                                                                  },
                                                                  void 0,
                                                                  !0,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                    lineNumber: 672,
                                                                    columnNumber: 31,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  _,
                                                                  {
                                                                    variant:
                                                                      "outline",
                                                                    className:
                                                                      "text-xs border-gray-600 text-gray-400",
                                                                    children: [
                                                                      s.res,
                                                                      "×",
                                                                      s.res,
                                                                    ],
                                                                  },
                                                                  void 0,
                                                                  !0,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                    lineNumber: 675,
                                                                    columnNumber: 31,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  _,
                                                                  {
                                                                    variant:
                                                                      "outline",
                                                                    className:
                                                                      "text-xs border-gray-600 text-gray-400",
                                                                    children:
                                                                      s.days,
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                    lineNumber: 678,
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
                                                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                              lineNumber: 671,
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
                                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                        lineNumber: 662,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className:
                                                          "text-xs text-gray-400",
                                                        children:
                                                          s.training_focus,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                        lineNumber: 683,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                    s.datasets?.length > 0 &&
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "flex flex-wrap gap-1 mt-1.5",
                                                          children: [
                                                            s.datasets
                                                              .slice(0, 4)
                                                              .map((f) =>
                                                                e.jsxDEV(
                                                                  "span",
                                                                  {
                                                                    className:
                                                                      "text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded",
                                                                    children: f,
                                                                  },
                                                                  f,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                    lineNumber: 687,
                                                                    columnNumber: 33,
                                                                  },
                                                                  this,
                                                                ),
                                                              ),
                                                            s.datasets.length >
                                                              4 &&
                                                              e.jsxDEV(
                                                                "span",
                                                                {
                                                                  className:
                                                                    "text-xs text-gray-500",
                                                                  children: [
                                                                    "+",
                                                                    s.datasets
                                                                      .length -
                                                                      4,
                                                                    " more",
                                                                  ],
                                                                },
                                                                void 0,
                                                                !0,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                                  lineNumber: 692,
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
                                                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                          lineNumber: 685,
                                                          columnNumber: 29,
                                                        },
                                                        this,
                                                      ),
                                                  ],
                                                },
                                                s.phase_id,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                                  lineNumber: 654,
                                                  columnNumber: 25,
                                                },
                                                this,
                                              );
                                            }),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                            lineNumber: 650,
                                            columnNumber: 19,
                                          },
                                          this,
                                        )
                                      : e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "text-center py-8 text-gray-500 text-sm",
                                            children: "Loading curriculum…",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                            lineNumber: 701,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                                    lineNumber: 648,
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
                                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                              lineNumber: 641,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                          lineNumber: 640,
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
                      "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
                    lineNumber: 344,
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
                "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
              lineNumber: 236,
              columnNumber: 7,
            },
            this,
          ),
        },
        void 0,
        !1,
        {
          fileName:
            "/home/runner/workspace/client/src/pages/admin/TrainingDashboard.tsx",
          lineNumber: 235,
          columnNumber: 5,
        },
        this,
      );
}
export { fe as default };
