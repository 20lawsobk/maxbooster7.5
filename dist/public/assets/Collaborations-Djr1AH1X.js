import {
  ag as he,
  ah as de,
  r as n,
  aH as x,
  aI as f,
  f as e,
  dc as G,
  a_ as pe,
  ac as xe,
  v as fe,
  aK as Y,
  aO as J,
  dS as ge,
  bc as ve,
  aR as we,
  aM as Ce,
  dW as je,
  fN as y,
  d0 as ke,
} from "./vendor-react-31oK5L0i.js";
import {
  u as De,
  C as i,
  d as g,
  f as v,
  h as w,
  j as a,
  a4 as Ee,
  a5 as Ve,
  a6 as S,
  a9 as P,
  I as T,
  g as W,
  i as F,
  B as M,
  o as X,
  p as Z,
  r as _,
  v as ee,
  w as se,
  L as U,
  y as re,
  ac as ae,
  k as q,
  a as ye,
} from "./studio-DOUfHW5v.js";
import { a as Se } from "./index-D5xLbTBZ.js";
import { A as Pe } from "./AppLayout-D2pri0rw.js";
import { A as u, a as N, b } from "./avatar-G9hM18TN.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
import "./TopBar-jcH3P98k.js";
function Qe() {
  const { user: t } = Se(),
    [, C] = he(),
    { toast: o } = De(),
    h = de(),
    [d, oe] = n.useState(""),
    [le, p] = n.useState(!1),
    [l, L] = n.useState(null),
    [K, O] = n.useState(""),
    [ne, c] = n.useState(!1),
    [j, R] = n.useState(""),
    [A, Q] = n.useState(""),
    [z, I] = n.useState(""),
    { data: ie, isLoading: te } = x({
      queryKey: ["/api/collaborations/connections"],
      enabled: !!t,
    }),
    { data: ce } = x({
      queryKey: ["/api/collaborations/connections/pending"],
      enabled: !!t,
    }),
    { data: me } = x({
      queryKey: ["/api/collaborations/suggestions"],
      enabled: !!t,
    }),
    { data: ue } = x({
      queryKey: ["/api/collaborations/projects"],
      enabled: !!t,
    }),
    k = f({
      mutationFn: async () => {
        if (!l) throw new Error("No user selected");
        const s = q(),
          r = await fetch("/api/collaborations/connect", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(s ? { "x-csrf-token": s } : {}),
            },
            credentials: "include",
            body: JSON.stringify({ userId: l.userId, message: K }),
          });
        if (!r.ok) throw new Error("Failed to send connection request");
        return r.json();
      },
      onSuccess: () => {
        (h.invalidateQueries({ queryKey: ["/api/collaborations"] }),
          p(!1),
          L(null),
          O(""),
          o({
            title: "Request sent",
            description: "Your connection request has been sent.",
          }));
      },
      onError: (s) => {
        o({ title: "Error", description: s.message, variant: "destructive" });
      },
    }),
    Ne = f({
      mutationFn: async (s) => {
        const r = q(),
          m = await fetch(`/api/collaborations/accept/${s}`, {
            method: "POST",
            credentials: "include",
            headers: r ? { "x-csrf-token": r } : {},
          });
        if (!m.ok) throw new Error("Failed to accept connection");
        return m.json();
      },
      onSuccess: () => {
        (h.invalidateQueries({ queryKey: ["/api/collaborations"] }),
          o({ title: "Connection accepted" }));
      },
    }),
    be = f({
      mutationFn: async (s) => {
        const r = q(),
          m = await fetch(`/api/collaborations/decline/${s}`, {
            method: "POST",
            credentials: "include",
            headers: r ? { "x-csrf-token": r } : {},
          });
        if (!m.ok) throw new Error("Failed to decline connection");
        return m.json();
      },
      onSuccess: () => {
        (h.invalidateQueries({ queryKey: ["/api/collaborations"] }),
          o({ title: "Connection declined" }));
      },
    }),
    D = f({
      mutationFn: async (s) =>
        (await ye("POST", "/api/collaborations/projects", s)).json(),
      onSuccess: () => {
        (h.invalidateQueries({ queryKey: ["/api/collaborations/projects"] }),
          c(!1),
          R(""),
          Q(""),
          I(""),
          o({
            title: "Project created!",
            description: "Your collaboration project is ready.",
          }));
      },
      onError: () => {
        o({
          title: "Error",
          description: "Failed to create project",
          variant: "destructive",
        });
      },
    });
  if (!t) return (C("/login"), null);
  const E = ie || [],
    V = ce || [],
    H = me || [],
    $ = ue?.projects || [],
    B = d
      ? E.filter(
          (s) =>
            s.name.toLowerCase().includes(d.toLowerCase()) ||
            s.role.toLowerCase().includes(d.toLowerCase()),
        )
      : E;
  return e.jsxDEV(
    Pe,
    {
      children: te
        ? e.jsxDEV(
            "div",
            {
              className:
                "min-h-screen bg-background flex items-center justify-center",
              children: e.jsxDEV(
                "div",
                {
                  className:
                    "animate-spin rounded-full h-8 w-8 border-b-2 border-primary",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                  lineNumber: 186,
                  columnNumber: 11,
                },
                this,
              ),
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
              lineNumber: 185,
              columnNumber: 9,
            },
            this,
          )
        : e.jsxDEV(
            e.Fragment,
            {
              children: e.jsxDEV(
                "div",
                {
                  className: "space-y-6",
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className: "flex items-center justify-between",
                        children: e.jsxDEV(
                          "div",
                          {
                            children: [
                              e.jsxDEV(
                                "h1",
                                {
                                  className:
                                    "text-3xl font-bold flex items-center gap-3",
                                  children: [
                                    e.jsxDEV(
                                      G,
                                      { className: "h-8 w-8 text-primary" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 194,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    "Collaborations",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                  lineNumber: 193,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-muted-foreground mt-1",
                                  children:
                                    "Connect with artists, producers, and industry professionals",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                  lineNumber: 197,
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
                              "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                            lineNumber: 192,
                            columnNumber: 11,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                        lineNumber: 191,
                        columnNumber: 9,
                      },
                      this,
                    ),
                    V.length > 0 &&
                      e.jsxDEV(
                        i,
                        {
                          className: "border-amber-500/50 bg-amber-500/5",
                          children: [
                            e.jsxDEV(
                              g,
                              {
                                children: e.jsxDEV(
                                  v,
                                  {
                                    className:
                                      "text-lg flex items-center gap-2",
                                    children: [
                                      e.jsxDEV(
                                        pe,
                                        { className: "h-5 w-5 text-amber-500" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                          lineNumber: 207,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      "Pending Connection Requests (",
                                      V.length,
                                      ")",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                    lineNumber: 206,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                lineNumber: 205,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              w,
                              {
                                children: e.jsxDEV(
                                  "div",
                                  {
                                    className: "grid gap-3",
                                    children: V.map((s) =>
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-center justify-between p-3 rounded-lg bg-background",
                                          children: [
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex items-center gap-3",
                                                children: [
                                                  e.jsxDEV(
                                                    u,
                                                    {
                                                      children: [
                                                        e.jsxDEV(
                                                          N,
                                                          { src: s.avatar },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                            lineNumber: 217,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          b,
                                                          {
                                                            children: (
                                                              s.name || "UN"
                                                            )
                                                              .slice(0, 2)
                                                              .toUpperCase(),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                            lineNumber: 218,
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
                                                        "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                      lineNumber: 216,
                                                      columnNumber: 23,
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
                                                              "font-medium",
                                                            children: s.name,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                            lineNumber: 221,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "p",
                                                          {
                                                            className:
                                                              "text-sm text-muted-foreground",
                                                            children: s.role,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                            lineNumber: 222,
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
                                                        "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                      lineNumber: 220,
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
                                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                lineNumber: 215,
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
                                                    a,
                                                    {
                                                      size: "sm",
                                                      variant: "outline",
                                                      onClick: () =>
                                                        be.mutate(s.id),
                                                      children: e.jsxDEV(
                                                        xe,
                                                        {
                                                          className: "h-4 w-4",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                          lineNumber: 231,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                      lineNumber: 226,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    a,
                                                    {
                                                      size: "sm",
                                                      onClick: () =>
                                                        Ne.mutate(s.id),
                                                      children: [
                                                        e.jsxDEV(
                                                          fe,
                                                          {
                                                            className:
                                                              "h-4 w-4 mr-1",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                            lineNumber: 237,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        "Accept",
                                                      ],
                                                    },
                                                    void 0,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                      lineNumber: 233,
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
                                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                lineNumber: 225,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        s.id,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                          lineNumber: 214,
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
                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                    lineNumber: 212,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                lineNumber: 211,
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
                            "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                          lineNumber: 204,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    e.jsxDEV(
                      Ee,
                      {
                        defaultValue: "connections",
                        className: "space-y-4",
                        children: [
                          e.jsxDEV(
                            Ve,
                            {
                              children: [
                                e.jsxDEV(
                                  S,
                                  {
                                    value: "connections",
                                    children: ["My Network (", E.length, ")"],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                    lineNumber: 250,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  S,
                                  { value: "discover", children: "Discover" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                    lineNumber: 251,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  S,
                                  {
                                    value: "projects",
                                    children: "Collab Projects",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                    lineNumber: 252,
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
                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                              lineNumber: 249,
                              columnNumber: 11,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            P,
                            {
                              value: "connections",
                              className: "space-y-4",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "relative",
                                    children: [
                                      e.jsxDEV(
                                        Y,
                                        {
                                          className:
                                            "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                          lineNumber: 257,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        T,
                                        {
                                          placeholder: "Search connections...",
                                          value: d,
                                          onChange: (s) => oe(s.target.value),
                                          className: "pl-10",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                          lineNumber: 258,
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
                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                    lineNumber: 256,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                B.length === 0
                                  ? e.jsxDEV(
                                      i,
                                      {
                                        className: "p-8 text-center",
                                        children: [
                                          e.jsxDEV(
                                            G,
                                            {
                                              className:
                                                "h-12 w-12 text-muted-foreground mx-auto mb-4",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 268,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "h3",
                                            {
                                              className: "font-medium",
                                              children: "No connections yet",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 269,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-sm text-muted-foreground mt-1",
                                              children:
                                                "Discover and connect with other artists and professionals",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 270,
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
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 267,
                                        columnNumber: 15,
                                      },
                                      this,
                                    )
                                  : e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "grid md:grid-cols-2 lg:grid-cols-3 gap-4",
                                        children: B.map((s) =>
                                          e.jsxDEV(
                                            i,
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  g,
                                                  {
                                                    children: e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center gap-3",
                                                        children: [
                                                          e.jsxDEV(
                                                            u,
                                                            {
                                                              className:
                                                                "h-12 w-12",
                                                              children: [
                                                                e.jsxDEV(
                                                                  N,
                                                                  {
                                                                    src: s.avatar,
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                    lineNumber: 281,
                                                                    columnNumber: 27,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  b,
                                                                  {
                                                                    children: (
                                                                      s.name ||
                                                                      "UN"
                                                                    )
                                                                      .slice(
                                                                        0,
                                                                        2,
                                                                      )
                                                                      .toUpperCase(),
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                    lineNumber: 282,
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
                                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                              lineNumber: 280,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              children: [
                                                                e.jsxDEV(
                                                                  v,
                                                                  {
                                                                    className:
                                                                      "text-base",
                                                                    children:
                                                                      s.name,
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                    lineNumber: 285,
                                                                    columnNumber: 27,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  W,
                                                                  {
                                                                    children:
                                                                      s.role,
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                    lineNumber: 286,
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
                                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                              lineNumber: 284,
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
                                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                        lineNumber: 279,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                    lineNumber: 278,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  w,
                                                  {
                                                    children: e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "space-y-2 text-sm",
                                                        children: [
                                                          s.genres &&
                                                            s.genres.length >
                                                              0 &&
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "flex items-center gap-2",
                                                                children: [
                                                                  e.jsxDEV(
                                                                    J,
                                                                    {
                                                                      className:
                                                                        "h-4 w-4 text-muted-foreground",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                      lineNumber: 294,
                                                                      columnNumber: 29,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "span",
                                                                    {
                                                                      children:
                                                                        s.genres
                                                                          .slice(
                                                                            0,
                                                                            3,
                                                                          )
                                                                          .join(
                                                                            ", ",
                                                                          ),
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                      lineNumber: 295,
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
                                                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                lineNumber: 293,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            ),
                                                          s.location &&
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "flex items-center gap-2",
                                                                children: [
                                                                  e.jsxDEV(
                                                                    ge,
                                                                    {
                                                                      className:
                                                                        "h-4 w-4 text-muted-foreground",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                      lineNumber: 300,
                                                                      columnNumber: 29,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "span",
                                                                    {
                                                                      children:
                                                                        s.location,
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                      lineNumber: 301,
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
                                                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                lineNumber: 299,
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
                                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
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
                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                    lineNumber: 290,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  F,
                                                  {
                                                    className: "gap-2",
                                                    children: [
                                                      e.jsxDEV(
                                                        a,
                                                        {
                                                          variant: "outline",
                                                          size: "sm",
                                                          className: "flex-1",
                                                          onClick: () => {
                                                            (o({
                                                              title:
                                                                "Message sent",
                                                              description: `Opening conversation with ${s.name}`,
                                                            }),
                                                              C(
                                                                "/social-media",
                                                              ));
                                                          },
                                                          children: [
                                                            e.jsxDEV(
                                                              ve,
                                                              {
                                                                className:
                                                                  "h-4 w-4 mr-1",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                lineNumber: 316,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            ),
                                                            "Message",
                                                          ],
                                                        },
                                                        void 0,
                                                        !0,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                          lineNumber: 307,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        a,
                                                        {
                                                          variant: "outline",
                                                          size: "sm",
                                                          onClick: () => {
                                                            o({
                                                              title: s.name,
                                                              description: `${s.role}${s.location ? ` · ${s.location}` : ""}`,
                                                            });
                                                          },
                                                          children:
                                                            "View Profile",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                          lineNumber: 319,
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
                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                    lineNumber: 306,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                              ],
                                            },
                                            s.id,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 277,
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
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 275,
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
                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                              lineNumber: 255,
                              columnNumber: 11,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            P,
                            {
                              value: "discover",
                              className: "space-y-4",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "flex items-center justify-between",
                                    children: e.jsxDEV(
                                      "h3",
                                      {
                                        className:
                                          "font-medium flex items-center gap-2",
                                        children: [
                                          e.jsxDEV(
                                            we,
                                            {
                                              className:
                                                "h-5 w-5 text-amber-500",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 338,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          "Suggested for You",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 337,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                    lineNumber: 336,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                H.length === 0
                                  ? e.jsxDEV(
                                      i,
                                      {
                                        className: "p-8 text-center",
                                        children: [
                                          e.jsxDEV(
                                            Y,
                                            {
                                              className:
                                                "h-12 w-12 text-muted-foreground mx-auto mb-4",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 345,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "h3",
                                            {
                                              className: "font-medium",
                                              children: "No suggestions yet",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 346,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-sm text-muted-foreground mt-1",
                                              children:
                                                "Complete your profile to get personalized suggestions",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 347,
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
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 344,
                                        columnNumber: 15,
                                      },
                                      this,
                                    )
                                  : e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "grid md:grid-cols-2 lg:grid-cols-3 gap-4",
                                        children: H.map((s) =>
                                          e.jsxDEV(
                                            i,
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  g,
                                                  {
                                                    children: e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center gap-3",
                                                        children: [
                                                          e.jsxDEV(
                                                            u,
                                                            {
                                                              className:
                                                                "h-12 w-12",
                                                              children: [
                                                                e.jsxDEV(
                                                                  N,
                                                                  {
                                                                    src: s.avatar,
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                    lineNumber: 358,
                                                                    columnNumber: 27,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  b,
                                                                  {
                                                                    children: (
                                                                      s.name ||
                                                                      "UN"
                                                                    )
                                                                      .slice(
                                                                        0,
                                                                        2,
                                                                      )
                                                                      .toUpperCase(),
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                    lineNumber: 359,
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
                                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                              lineNumber: 357,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "flex-1",
                                                              children: [
                                                                e.jsxDEV(
                                                                  v,
                                                                  {
                                                                    className:
                                                                      "text-base",
                                                                    children:
                                                                      s.name,
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                    lineNumber: 362,
                                                                    columnNumber: 27,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  W,
                                                                  {
                                                                    children:
                                                                      s.role,
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                    lineNumber: 363,
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
                                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                              lineNumber: 361,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            M,
                                                            {
                                                              variant:
                                                                "secondary",
                                                              className:
                                                                "text-xs",
                                                              children: [
                                                                e.jsxDEV(
                                                                  Ce,
                                                                  {
                                                                    className:
                                                                      "h-3 w-3 mr-1",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                    lineNumber: 366,
                                                                    columnNumber: 27,
                                                                  },
                                                                  this,
                                                                ),
                                                                s.matchScore,
                                                                "% Match",
                                                              ],
                                                            },
                                                            void 0,
                                                            !0,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                              lineNumber: 365,
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
                                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                        lineNumber: 356,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                    lineNumber: 355,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  w,
                                                  {
                                                    children: e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: "space-y-2",
                                                        children: [
                                                          s.genres &&
                                                            s.genres.length >
                                                              0 &&
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "flex flex-wrap gap-1",
                                                                children:
                                                                  s.genres
                                                                    .slice(0, 3)
                                                                    .map((r) =>
                                                                      e.jsxDEV(
                                                                        M,
                                                                        {
                                                                          variant:
                                                                            "outline",
                                                                          className:
                                                                            "text-xs",
                                                                          children:
                                                                            r,
                                                                        },
                                                                        r,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                          lineNumber: 376,
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
                                                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                lineNumber: 374,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            ),
                                                          s.matchReasons
                                                            .length > 0 &&
                                                            e.jsxDEV(
                                                              "p",
                                                              {
                                                                className:
                                                                  "text-xs text-muted-foreground",
                                                                children:
                                                                  s
                                                                    .matchReasons[0],
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                lineNumber: 383,
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
                                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                        lineNumber: 372,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                    lineNumber: 371,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  F,
                                                  {
                                                    children: e.jsxDEV(
                                                      a,
                                                      {
                                                        className: "w-full",
                                                        onClick: () => {
                                                          (L(s), p(!0));
                                                        },
                                                        children: [
                                                          e.jsxDEV(
                                                            je,
                                                            {
                                                              className:
                                                                "h-4 w-4 mr-2",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                              lineNumber: 397,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          "Connect",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                        lineNumber: 390,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                    lineNumber: 389,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                              ],
                                            },
                                            s.id,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 354,
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
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 352,
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
                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                              lineNumber: 335,
                              columnNumber: 11,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            P,
                            {
                              value: "projects",
                              className: "space-y-4",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex justify-end",
                                    children: e.jsxDEV(
                                      a,
                                      {
                                        onClick: () => c(!0),
                                        children: [
                                          e.jsxDEV(
                                            y,
                                            { className: "h-4 w-4 mr-2" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 410,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          "New Project",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 409,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                    lineNumber: 408,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                $.length === 0
                                  ? e.jsxDEV(
                                      i,
                                      {
                                        className: "p-8 text-center",
                                        children: [
                                          e.jsxDEV(
                                            J,
                                            {
                                              className:
                                                "h-12 w-12 text-muted-foreground mx-auto mb-4",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 416,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "h3",
                                            {
                                              className: "font-medium",
                                              children:
                                                "No collaboration projects",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 417,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-sm text-muted-foreground mt-1",
                                              children:
                                                "Start a project with your connections to collaborate on music",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 418,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            a,
                                            {
                                              className: "mt-4",
                                              onClick: () => c(!0),
                                              children: [
                                                e.jsxDEV(
                                                  y,
                                                  { className: "h-4 w-4 mr-2" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                    lineNumber: 422,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                "Start a Project",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
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
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 415,
                                        columnNumber: 15,
                                      },
                                      this,
                                    )
                                  : e.jsxDEV(
                                      "div",
                                      {
                                        className: "grid gap-4",
                                        children: $.map((s) =>
                                          e.jsxDEV(
                                            i,
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  g,
                                                  {
                                                    children: e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center justify-between",
                                                        children: [
                                                          e.jsxDEV(
                                                            v,
                                                            {
                                                              className:
                                                                "text-lg",
                                                              children: s.name,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                              lineNumber: 432,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            M,
                                                            {
                                                              variant:
                                                                s.status ===
                                                                "active"
                                                                  ? "default"
                                                                  : "secondary",
                                                              children:
                                                                s.status,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                              lineNumber: 433,
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
                                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                        lineNumber: 431,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                    lineNumber: 430,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  w,
                                                  {
                                                    children: e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center gap-2",
                                                        children: [
                                                          e.jsxDEV(
                                                            "span",
                                                            {
                                                              className:
                                                                "text-sm text-muted-foreground",
                                                              children:
                                                                "Collaborators:",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                              lineNumber: 440,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "flex -space-x-2",
                                                              children:
                                                                s.collaborators.map(
                                                                  (r) =>
                                                                    e.jsxDEV(
                                                                      u,
                                                                      {
                                                                        className:
                                                                          "h-8 w-8 border-2 border-background",
                                                                        children:
                                                                          [
                                                                            e.jsxDEV(
                                                                              N,
                                                                              {
                                                                                src: r.avatar,
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                                lineNumber: 444,
                                                                                columnNumber: 31,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              b,
                                                                              {
                                                                                children:
                                                                                  (
                                                                                    r.name ||
                                                                                    "UN"
                                                                                  ).slice(
                                                                                    0,
                                                                                    2,
                                                                                  ),
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                                lineNumber: 445,
                                                                                columnNumber: 31,
                                                                              },
                                                                              this,
                                                                            ),
                                                                          ],
                                                                      },
                                                                      r.id,
                                                                      !0,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                                        lineNumber: 443,
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
                                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                              lineNumber: 441,
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
                                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                        lineNumber: 439,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                    lineNumber: 438,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  F,
                                                  {
                                                    children: e.jsxDEV(
                                                      a,
                                                      {
                                                        variant: "outline",
                                                        size: "sm",
                                                        onClick: () =>
                                                          C("/workspaces"),
                                                        children:
                                                          "Open Project",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                        lineNumber: 452,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                    lineNumber: 451,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                              ],
                                            },
                                            s.id,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 429,
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
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 427,
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
                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                              lineNumber: 407,
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
                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                        lineNumber: 248,
                        columnNumber: 9,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      X,
                      {
                        open: ne,
                        onOpenChange: c,
                        children: e.jsxDEV(
                          Z,
                          {
                            className: "max-w-md",
                            children: [
                              e.jsxDEV(
                                _,
                                {
                                  children: [
                                    e.jsxDEV(
                                      ee,
                                      {
                                        children:
                                          "Start a Collaboration Project",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 471,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      se,
                                      {
                                        children:
                                          "Create a shared workspace for you and your collaborators to work on music together.",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
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
                                    "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                  lineNumber: 470,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-4 py-2",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "space-y-2",
                                        children: [
                                          e.jsxDEV(
                                            U,
                                            {
                                              htmlFor: "project-name",
                                              children: "Project Name *",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 478,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            T,
                                            {
                                              id: "project-name",
                                              placeholder:
                                                "e.g. Summer EP with DJ Karim",
                                              value: j,
                                              onChange: (s) =>
                                                R(s.target.value),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 479,
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
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 477,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "space-y-2",
                                        children: [
                                          e.jsxDEV(
                                            U,
                                            {
                                              htmlFor: "project-genre",
                                              children: "Genre",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 487,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            T,
                                            {
                                              id: "project-genre",
                                              placeholder:
                                                "e.g. Hip-Hop, R&B, Afrobeats...",
                                              value: z,
                                              onChange: (s) =>
                                                I(s.target.value),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 488,
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
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 486,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "space-y-2",
                                        children: [
                                          e.jsxDEV(
                                            U,
                                            {
                                              htmlFor: "project-desc",
                                              children: "Description",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 496,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            re,
                                            {
                                              id: "project-desc",
                                              placeholder:
                                                "What's the vision for this project? Goals, vibe, timeline...",
                                              rows: 3,
                                              value: A,
                                              onChange: (s) =>
                                                Q(s.target.value),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
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
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 495,
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
                                    "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                  lineNumber: 476,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                ae,
                                {
                                  children: [
                                    e.jsxDEV(
                                      a,
                                      {
                                        variant: "outline",
                                        onClick: () => c(!1),
                                        children: "Cancel",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 507,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      a,
                                      {
                                        onClick: () =>
                                          D.mutate({
                                            title: j,
                                            description: A,
                                            genre: z,
                                          }),
                                        disabled: !j.trim() || D.isPending,
                                        children: [
                                          e.jsxDEV(
                                            y,
                                            { className: "h-4 w-4 mr-2" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 512,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          D.isPending
                                            ? "Creating..."
                                            : "Create Project",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 508,
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
                                    "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                  lineNumber: 506,
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
                              "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                            lineNumber: 469,
                            columnNumber: 11,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                        lineNumber: 468,
                        columnNumber: 9,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      X,
                      {
                        open: le,
                        onOpenChange: p,
                        children: e.jsxDEV(
                          Z,
                          {
                            children: [
                              e.jsxDEV(
                                _,
                                {
                                  children: [
                                    e.jsxDEV(
                                      ee,
                                      { children: ["Connect with ", l?.name] },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 522,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      se,
                                      {
                                        children:
                                          "Send a personalized message with your connection request",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 523,
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
                                    "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                  lineNumber: 521,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              l &&
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "flex items-center gap-3 p-3 bg-muted/50 rounded-lg",
                                    children: [
                                      e.jsxDEV(
                                        u,
                                        {
                                          children: [
                                            e.jsxDEV(
                                              N,
                                              { src: l.avatar },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                lineNumber: 531,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              b,
                                              {
                                                children: (l.name || "UN")
                                                  .slice(0, 2)
                                                  .toUpperCase(),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                lineNumber: 532,
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
                                            "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                          lineNumber: 530,
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
                                                className: "font-medium",
                                                children: l.name,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                lineNumber: 535,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-sm text-muted-foreground",
                                                children: l.role,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                                lineNumber: 536,
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
                                            "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                          lineNumber: 534,
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
                                      "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                    lineNumber: 529,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              e.jsxDEV(
                                re,
                                {
                                  placeholder:
                                    "Hi, I'd love to connect and potentially collaborate on some music...",
                                  value: K,
                                  onChange: (s) => O(s.target.value),
                                  rows: 4,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                  lineNumber: 541,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                ae,
                                {
                                  children: [
                                    e.jsxDEV(
                                      a,
                                      {
                                        variant: "outline",
                                        onClick: () => p(!1),
                                        children: "Cancel",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 549,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      a,
                                      {
                                        onClick: () => k.mutate(),
                                        disabled: k.isPending,
                                        children: [
                                          e.jsxDEV(
                                            ke,
                                            { className: "h-4 w-4 mr-2" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                              lineNumber: 554,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          k.isPending
                                            ? "Sending..."
                                            : "Send Request",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                        lineNumber: 550,
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
                                    "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                                  lineNumber: 548,
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
                              "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                            lineNumber: 520,
                            columnNumber: 11,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                        lineNumber: 519,
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
                    "/home/runner/workspace/client/src/pages/Collaborations.tsx",
                  lineNumber: 190,
                  columnNumber: 7,
                },
                this,
              ),
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/Collaborations.tsx",
              lineNumber: 189,
              columnNumber: 9,
            },
            this,
          ),
    },
    void 0,
    !1,
    {
      fileName: "/home/runner/workspace/client/src/pages/Collaborations.tsx",
      lineNumber: 183,
      columnNumber: 5,
    },
    this,
  );
}
export { Qe as default };
