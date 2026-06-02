import {
  ag as de,
  ah as pe,
  r as m,
  aH as D,
  aI as j,
  f as e,
  a$ as Q,
  aY as U,
  bb as xe,
  ai as be,
  b2 as T,
  bc as Y,
  bu as X,
  dk as Z,
  b$ as fe,
  a_ as Ce,
  b9 as _,
  b7 as J,
  aO as ee,
  cU as A,
  aR as ge,
  d0 as we,
  dc as re,
  b0 as se,
  aM as ve,
  cX as ke,
} from "./vendor-react-31oK5L0i.js";
import { a as De } from "./index-D5xLbTBZ.js";
import { A as je } from "./AppLayout-D2pri0rw.js";
import {
  u as Ee,
  a4 as Ve,
  a5 as ye,
  a6 as H,
  a9 as G,
  C as i,
  d as l,
  a8 as a,
  h as o,
  f as u,
  g as L,
  B as R,
  i as Se,
  j as h,
  P as Ie,
  I as g,
  o as Te,
  p as Ae,
  r as He,
  v as Ge,
  L as p,
  W as Le,
  X as Re,
  Y as qe,
  Z as Pe,
  $ as x,
  y as Me,
  ac as Fe,
  a as E,
} from "./studio-DOUfHW5v.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
import "./TopBar-jcH3P98k.js";
function Xe() {
  const { user: b } = De(),
    [, q] = de(),
    { toast: N } = Ee(),
    P = pe(),
    [V, M] = m.useState(""),
    [y, f] = m.useState([]),
    [F, z] = m.useState(!1),
    w = m.useRef(null),
    B = m.useRef(null),
    [ae, v] = m.useState(!1),
    [n, d] = m.useState({
      title: "",
      goalType: "growth",
      targetValue: 1e3,
      unit: "",
      deadline: "",
      description: "",
    }),
    { data: ne, isLoading: ie } = D({
      queryKey: ["/api/career-coach/goals"],
      enabled: !!b,
    }),
    { data: ce, isLoading: le } = D({
      queryKey: ["/api/career-coach/recommendations"],
      enabled: !!b,
    }),
    { data: oe, isLoading: te } = D({
      queryKey: ["/api/career-coach/insights"],
      enabled: !!b,
    }),
    { data: S } = D({ queryKey: ["/api/assistant/history"], enabled: !!b });
  (m.useEffect(() => {
    if (S && !F) {
      const r = (S.messages || []).map((s) => ({
        id: s.id || String(s.createdAt),
        role: s.role === "assistant" ? "coach" : "user",
        content: s.content,
        timestamp: s.createdAt,
      }));
      (r.length > 0
        ? f(r)
        : f([
            {
              id: "welcome",
              role: "coach",
              content:
                "Hi! I'm Max, your AI Career Coach. I analyze your music career data to provide personalized recommendations. Ask me anything about growing your career, releasing music, building your fan base, or running your business as an artist.",
              timestamp: new Date().toISOString(),
              quickActions: [
                {
                  label: "How do I grow my fan base?",
                  prompt: "How do I grow my fan base?",
                },
                {
                  label: "Distribute my music",
                  prompt: "How do I distribute my music to all platforms?",
                },
                {
                  label: "Boost my streams",
                  prompt: "What can I do to boost my streaming numbers?",
                },
                {
                  label: "Start earning royalties",
                  prompt: "How do I start earning royalties from my music?",
                },
              ],
            },
          ]),
        z(!0));
    }
  }, [S, F]),
    m.useEffect(() => {
      w.current && (w.current.scrollTop = w.current.scrollHeight);
    }, [y]));
  const k = j({
      mutationFn: async (r) =>
        (await E("POST", "/api/assistant/chat", { message: r })).json(),
      onSuccess: (r) => {
        const s = r.quickActions || [],
          t = r.proactiveSuggestions || [];
        (f((Ne) => [
          ...Ne,
          {
            id: r.assistantMessageId || Date.now().toString(),
            role: "coach",
            content:
              r.content ||
              r.response ||
              "I'm here to help you grow your music career. What would you like to work on?",
            timestamp: new Date().toISOString(),
            quickActions: s.length > 0 ? s : void 0,
            proactiveSuggestions: t.length > 0 ? t : void 0,
          },
        ]),
          B.current?.focus());
      },
      onError: () => {
        N({
          title: "Error",
          description: "Failed to get AI response",
          variant: "destructive",
        });
      },
    }),
    $ = j({
      mutationFn: async () => {
        await E("DELETE", "/api/assistant/history");
      },
      onSuccess: () => {
        (f([
          {
            id: "welcome-new",
            role: "coach",
            content:
              "Conversation cleared! I'm ready to start fresh. What would you like to work on today?",
            timestamp: new Date().toISOString(),
            quickActions: [
              {
                label: "Grow my fan base",
                prompt: "How do I grow my fan base?",
              },
              {
                label: "Distribute music",
                prompt: "How do I distribute my music?",
              },
              {
                label: "Boost streams",
                prompt: "How do I boost my streaming numbers?",
              },
              {
                label: "Earn royalties",
                prompt: "How do I maximize my royalty earnings?",
              },
            ],
          },
        ]),
          z(!0),
          N({
            title: "Cleared",
            description: "Conversation history has been cleared.",
          }));
      },
    }),
    I = j({
      mutationFn: async (r) =>
        (await E("POST", "/api/career-coach/goals", r)).json(),
      onSuccess: () => {
        (P.invalidateQueries({ queryKey: ["/api/career-coach/goals"] }),
          v(!1),
          d({
            title: "",
            goalType: "growth",
            targetValue: 1e3,
            unit: "",
            deadline: "",
            description: "",
          }),
          N({
            title: "Goal created!",
            description: "Your career goal has been added.",
          }));
      },
      onError: () => {
        N({
          title: "Error",
          description: "Failed to create goal",
          variant: "destructive",
        });
      },
    }),
    O = j({
      mutationFn: async (r) =>
        (await E("DELETE", `/api/career-coach/goals/${r}`)).json(),
      onSuccess: () => {
        (P.invalidateQueries({ queryKey: ["/api/career-coach/goals"] }),
          N({ title: "Goal deleted" }));
      },
      onError: () => {
        N({
          title: "Error",
          description: "Failed to delete goal",
          variant: "destructive",
        });
      },
    }),
    C = (r) => {
      const s = (r || V).trim();
      s &&
        (f((t) => [
          ...t,
          {
            id: Date.now().toString(),
            role: "user",
            content: s,
            timestamp: new Date().toISOString(),
          },
        ]),
        k.mutate(s),
        M(""));
    },
    K = ne?.goals || [],
    W = ce?.recommendations || [],
    c = oe?.insights,
    me = (r) => {
      switch (r) {
        case "growth":
          return e.jsxDEV(
            _,
            { className: "h-4 w-4" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
              lineNumber: 240,
              columnNumber: 29,
            },
            this,
          );
        case "revenue":
          return e.jsxDEV(
            A,
            { className: "h-4 w-4" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
              lineNumber: 241,
              columnNumber: 30,
            },
            this,
          );
        case "releases":
          return e.jsxDEV(
            ee,
            { className: "h-4 w-4" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
              lineNumber: 242,
              columnNumber: 31,
            },
            this,
          );
        case "networking":
          return e.jsxDEV(
            re,
            { className: "h-4 w-4" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
              lineNumber: 243,
              columnNumber: 33,
            },
            this,
          );
        case "skills":
          return e.jsxDEV(
            se,
            { className: "h-4 w-4" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
              lineNumber: 244,
              columnNumber: 29,
            },
            this,
          );
        default:
          return e.jsxDEV(
            T,
            { className: "h-4 w-4" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
              lineNumber: 245,
              columnNumber: 23,
            },
            this,
          );
      }
    },
    ue = (r) => {
      const s = { high: "default", medium: "secondary", low: "outline" };
      return e.jsxDEV(
        R,
        { variant: s[r], children: r },
        void 0,
        !1,
        {
          fileName: "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
          lineNumber: 255,
          columnNumber: 12,
        },
        this,
      );
    },
    he = (r) => {
      switch (r) {
        case "action":
          return e.jsxDEV(
            ke,
            { className: "h-5 w-5 text-blue-500" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
              lineNumber: 260,
              columnNumber: 29,
            },
            this,
          );
        case "insight":
          return e.jsxDEV(
            se,
            { className: "h-5 w-5 text-amber-500" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
              lineNumber: 261,
              columnNumber: 30,
            },
            this,
          );
        case "opportunity":
          return e.jsxDEV(
            ve,
            { className: "h-5 w-5 text-green-500" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
              lineNumber: 262,
              columnNumber: 34,
            },
            this,
          );
        default:
          return e.jsxDEV(
            U,
            { className: "h-5 w-5" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
              lineNumber: 263,
              columnNumber: 23,
            },
            this,
          );
      }
    };
  return b
    ? e.jsxDEV(
        je,
        {
          children: [
            e.jsxDEV(
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
                                    Q,
                                    { className: "h-8 w-8 text-primary" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 278,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  "AI Career Coach",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                lineNumber: 277,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "p",
                              {
                                className: "text-muted-foreground mt-1",
                                children:
                                  "Personalized guidance to accelerate your music career",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                lineNumber: 281,
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
                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                          lineNumber: 276,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                      lineNumber: 275,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "grid lg:grid-cols-3 gap-6",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "lg:col-span-2 space-y-6",
                            children: e.jsxDEV(
                              Ve,
                              {
                                defaultValue: "recommendations",
                                className: "space-y-4",
                                children: [
                                  e.jsxDEV(
                                    ye,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          H,
                                          {
                                            value: "recommendations",
                                            children: "Recommendations",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                            lineNumber: 291,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          H,
                                          { value: "goals", children: "Goals" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                            lineNumber: 292,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          H,
                                          {
                                            value: "insights",
                                            children: "Insights",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                            lineNumber: 293,
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
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 290,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    G,
                                    {
                                      value: "recommendations",
                                      className: "space-y-4",
                                      children: le
                                        ? e.jsxDEV(
                                            "div",
                                            {
                                              className: "space-y-4",
                                              children: [1, 2, 3].map((r) =>
                                                e.jsxDEV(
                                                  i,
                                                  {
                                                    children: [
                                                      e.jsxDEV(
                                                        l,
                                                        {
                                                          children: e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "flex items-start justify-between",
                                                              children: [
                                                                e.jsxDEV(
                                                                  "div",
                                                                  {
                                                                    className:
                                                                      "flex items-start gap-3 flex-1",
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        a,
                                                                        {
                                                                          className:
                                                                            "h-5 w-5 rounded-full mt-0.5",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 304,
                                                                          columnNumber: 31,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        "div",
                                                                        {
                                                                          className:
                                                                            "flex-1 space-y-2",
                                                                          children:
                                                                            [
                                                                              e.jsxDEV(
                                                                                a,
                                                                                {
                                                                                  className:
                                                                                    "h-4 w-48",
                                                                                },
                                                                                void 0,
                                                                                !1,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                  lineNumber: 306,
                                                                                  columnNumber: 33,
                                                                                },
                                                                                this,
                                                                              ),
                                                                              e.jsxDEV(
                                                                                a,
                                                                                {
                                                                                  className:
                                                                                    "h-3 w-full",
                                                                                },
                                                                                void 0,
                                                                                !1,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                  lineNumber: 307,
                                                                                  columnNumber: 33,
                                                                                },
                                                                                this,
                                                                              ),
                                                                              e.jsxDEV(
                                                                                a,
                                                                                {
                                                                                  className:
                                                                                    "h-3 w-3/4",
                                                                                },
                                                                                void 0,
                                                                                !1,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                  lineNumber: 308,
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
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 305,
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
                                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                    lineNumber: 303,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  a,
                                                                  {
                                                                    className:
                                                                      "h-5 w-16 rounded-full ml-3",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                    lineNumber: 311,
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
                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                              lineNumber: 302,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                          lineNumber: 301,
                                                          columnNumber: 25,
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
                                                                "flex items-center gap-4",
                                                              children: [
                                                                e.jsxDEV(
                                                                  a,
                                                                  {
                                                                    className:
                                                                      "h-5 w-20 rounded-full",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                    lineNumber: 316,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  a,
                                                                  {
                                                                    className:
                                                                      "h-4 w-28",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                    lineNumber: 317,
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
                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                              lineNumber: 315,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                          lineNumber: 314,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                    ],
                                                  },
                                                  r,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                    lineNumber: 300,
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
                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                              lineNumber: 298,
                                              columnNumber: 19,
                                            },
                                            this,
                                          )
                                        : W.length === 0
                                          ? e.jsxDEV(
                                              i,
                                              {
                                                className: "p-8 text-center",
                                                children: [
                                                  e.jsxDEV(
                                                    U,
                                                    {
                                                      className:
                                                        "h-12 w-12 text-muted-foreground mx-auto mb-4",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                      lineNumber: 325,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "h3",
                                                    {
                                                      className: "font-medium",
                                                      children:
                                                        "No recommendations yet",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                      lineNumber: 326,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "p",
                                                    {
                                                      className:
                                                        "text-sm text-muted-foreground mt-1",
                                                      children:
                                                        "As you use the platform, I'll provide personalized recommendations",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                      lineNumber: 327,
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
                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                lineNumber: 324,
                                                columnNumber: 19,
                                              },
                                              this,
                                            )
                                          : e.jsxDEV(
                                              "div",
                                              {
                                                className: "space-y-4",
                                                children: W.map((r) =>
                                                  e.jsxDEV(
                                                    i,
                                                    {
                                                      children: [
                                                        e.jsxDEV(
                                                          l,
                                                          {
                                                            children: e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "flex items-start justify-between",
                                                                children: [
                                                                  e.jsxDEV(
                                                                    "div",
                                                                    {
                                                                      className:
                                                                        "flex items-start gap-3",
                                                                      children:
                                                                        [
                                                                          he(
                                                                            r.type,
                                                                          ),
                                                                          e.jsxDEV(
                                                                            "div",
                                                                            {
                                                                              children:
                                                                                [
                                                                                  e.jsxDEV(
                                                                                    u,
                                                                                    {
                                                                                      className:
                                                                                        "text-base",
                                                                                      children:
                                                                                        r.title,
                                                                                    },
                                                                                    void 0,
                                                                                    !1,
                                                                                    {
                                                                                      fileName:
                                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                      lineNumber: 340,
                                                                                      columnNumber: 33,
                                                                                    },
                                                                                    this,
                                                                                  ),
                                                                                  e.jsxDEV(
                                                                                    L,
                                                                                    {
                                                                                      className:
                                                                                        "mt-1",
                                                                                      children:
                                                                                        r.description,
                                                                                    },
                                                                                    void 0,
                                                                                    !1,
                                                                                    {
                                                                                      fileName:
                                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                      lineNumber: 341,
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
                                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                              lineNumber: 339,
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
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 337,
                                                                      columnNumber: 29,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  ue(
                                                                    r.priority,
                                                                  ),
                                                                ],
                                                              },
                                                              void 0,
                                                              !0,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 336,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                            lineNumber: 335,
                                                            columnNumber: 25,
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
                                                                  "flex items-center gap-4 text-sm",
                                                                children: [
                                                                  e.jsxDEV(
                                                                    R,
                                                                    {
                                                                      variant:
                                                                        "outline",
                                                                      children:
                                                                        r.category,
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 351,
                                                                      columnNumber: 29,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "span",
                                                                    {
                                                                      className:
                                                                        "text-muted-foreground",
                                                                      children:
                                                                        [
                                                                          "Impact: ",
                                                                          r.estimatedImpact,
                                                                        ],
                                                                    },
                                                                    void 0,
                                                                    !0,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 352,
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
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 350,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                            lineNumber: 349,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        r.actionUrl &&
                                                          e.jsxDEV(
                                                            Se,
                                                            {
                                                              children:
                                                                e.jsxDEV(
                                                                  h,
                                                                  {
                                                                    size: "sm",
                                                                    onClick:
                                                                      () =>
                                                                        q(
                                                                          r.actionUrl,
                                                                        ),
                                                                    children: [
                                                                      "Take Action",
                                                                      e.jsxDEV(
                                                                        xe,
                                                                        {
                                                                          className:
                                                                            "h-4 w-4 ml-1",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 361,
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
                                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                    lineNumber: 359,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                              lineNumber: 358,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                      ],
                                                    },
                                                    r.id,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                      lineNumber: 334,
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
                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                lineNumber: 332,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 296,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    G,
                                    {
                                      value: "goals",
                                      className: "space-y-4",
                                      children: [
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "flex justify-end",
                                            children: e.jsxDEV(
                                              h,
                                              {
                                                size: "sm",
                                                onClick: () => v(!0),
                                                children: [
                                                  e.jsxDEV(
                                                    be,
                                                    {
                                                      className: "h-4 w-4 mr-1",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                      lineNumber: 374,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  "New Goal",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                lineNumber: 373,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                            lineNumber: 372,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        ie
                                          ? e.jsxDEV(
                                              "div",
                                              {
                                                className: "space-y-4",
                                                children: [1, 2].map((r) =>
                                                  e.jsxDEV(
                                                    i,
                                                    {
                                                      children: [
                                                        e.jsxDEV(
                                                          l,
                                                          {
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
                                                                          "flex items-center gap-2",
                                                                        children:
                                                                          [
                                                                            e.jsxDEV(
                                                                              a,
                                                                              {
                                                                                className:
                                                                                  "h-4 w-4",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                lineNumber: 385,
                                                                                columnNumber: 31,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              a,
                                                                              {
                                                                                className:
                                                                                  "h-4 w-48",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                lineNumber: 386,
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
                                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                        lineNumber: 384,
                                                                        columnNumber: 29,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    e.jsxDEV(
                                                                      a,
                                                                      {
                                                                        className:
                                                                          "h-5 w-16 rounded-full",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                        lineNumber: 388,
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
                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                  lineNumber: 383,
                                                                  columnNumber: 27,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "div",
                                                                {
                                                                  className:
                                                                    "flex items-center gap-2 mt-1",
                                                                  children: [
                                                                    e.jsxDEV(
                                                                      a,
                                                                      {
                                                                        className:
                                                                          "h-3 w-3",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                        lineNumber: 391,
                                                                        columnNumber: 29,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    e.jsxDEV(
                                                                      a,
                                                                      {
                                                                        className:
                                                                          "h-3 w-32",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                        lineNumber: 392,
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
                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                  lineNumber: 390,
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
                                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                            lineNumber: 382,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          o,
                                                          {
                                                            className:
                                                              "space-y-4",
                                                            children: [
                                                              e.jsxDEV(
                                                                "div",
                                                                {
                                                                  children: [
                                                                    e.jsxDEV(
                                                                      "div",
                                                                      {
                                                                        className:
                                                                          "flex justify-between mb-1",
                                                                        children:
                                                                          [
                                                                            e.jsxDEV(
                                                                              a,
                                                                              {
                                                                                className:
                                                                                  "h-3 w-16",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                lineNumber: 398,
                                                                                columnNumber: 31,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              a,
                                                                              {
                                                                                className:
                                                                                  "h-3 w-8",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                lineNumber: 399,
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
                                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                        lineNumber: 397,
                                                                        columnNumber: 29,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    e.jsxDEV(
                                                                      a,
                                                                      {
                                                                        className:
                                                                          "h-2 w-full rounded-full",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                        lineNumber: 401,
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
                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                  lineNumber: 396,
                                                                  columnNumber: 27,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "div",
                                                                {
                                                                  className:
                                                                    "space-y-2",
                                                                  children: [
                                                                    1, 2, 3,
                                                                  ].map((s) =>
                                                                    e.jsxDEV(
                                                                      "div",
                                                                      {
                                                                        className:
                                                                          "flex items-center gap-2",
                                                                        children:
                                                                          [
                                                                            e.jsxDEV(
                                                                              a,
                                                                              {
                                                                                className:
                                                                                  "h-4 w-4 rounded-full",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                lineNumber: 406,
                                                                                columnNumber: 33,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              a,
                                                                              {
                                                                                className:
                                                                                  "h-3 w-40",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                lineNumber: 407,
                                                                                columnNumber: 33,
                                                                              },
                                                                              this,
                                                                            ),
                                                                          ],
                                                                      },
                                                                      s,
                                                                      !0,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                        lineNumber: 405,
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
                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                  lineNumber: 403,
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
                                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                            lineNumber: 395,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                      ],
                                                    },
                                                    r,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                      lineNumber: 381,
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
                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                lineNumber: 379,
                                                columnNumber: 19,
                                              },
                                              this,
                                            )
                                          : K.length === 0
                                            ? e.jsxDEV(
                                                i,
                                                {
                                                  className: "p-8 text-center",
                                                  children: [
                                                    e.jsxDEV(
                                                      T,
                                                      {
                                                        className:
                                                          "h-12 w-12 text-muted-foreground mx-auto mb-4",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                        lineNumber: 417,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "h3",
                                                      {
                                                        className:
                                                          "font-medium",
                                                        children:
                                                          "Set your first career goal",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                        lineNumber: 418,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className:
                                                          "text-sm text-muted-foreground mt-1 max-w-md mx-auto",
                                                        children:
                                                          "Define what success looks like for you, and I'll help you create a roadmap to get there",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                        lineNumber: 419,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      h,
                                                      {
                                                        className: "mt-4",
                                                        onClick: () =>
                                                          C(
                                                            "Help me set a career goal for my music",
                                                          ),
                                                        children: [
                                                          e.jsxDEV(
                                                            Y,
                                                            {
                                                              className:
                                                                "h-4 w-4 mr-2",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                              lineNumber: 423,
                                                              columnNumber: 23,
                                                            },
                                                            this,
                                                          ),
                                                          "Ask Coach to Help",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                        lineNumber: 422,
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
                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                  lineNumber: 416,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              )
                                            : e.jsxDEV(
                                                "div",
                                                {
                                                  className: "space-y-4",
                                                  children: K.map((r) =>
                                                    e.jsxDEV(
                                                      i,
                                                      {
                                                        children: [
                                                          e.jsxDEV(
                                                            l,
                                                            {
                                                              children: [
                                                                e.jsxDEV(
                                                                  "div",
                                                                  {
                                                                    className:
                                                                      "flex items-center justify-between",
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        u,
                                                                        {
                                                                          className:
                                                                            "text-base flex items-center gap-2",
                                                                          children:
                                                                            [
                                                                              me(
                                                                                r.category,
                                                                              ),
                                                                              r.title,
                                                                            ],
                                                                        },
                                                                        void 0,
                                                                        !0,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 433,
                                                                          columnNumber: 29,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        "div",
                                                                        {
                                                                          className:
                                                                            "flex items-center gap-2",
                                                                          children:
                                                                            [
                                                                              e.jsxDEV(
                                                                                R,
                                                                                {
                                                                                  variant:
                                                                                    r.status ===
                                                                                    "completed"
                                                                                      ? "default"
                                                                                      : "outline",
                                                                                  children:
                                                                                    r.status,
                                                                                },
                                                                                void 0,
                                                                                !1,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                  lineNumber: 438,
                                                                                  columnNumber: 31,
                                                                                },
                                                                                this,
                                                                              ),
                                                                              e.jsxDEV(
                                                                                h,
                                                                                {
                                                                                  variant:
                                                                                    "ghost",
                                                                                  size: "sm",
                                                                                  className:
                                                                                    "h-6 w-6 p-0 text-muted-foreground hover:text-destructive",
                                                                                  onClick:
                                                                                    () =>
                                                                                      O.mutate(
                                                                                        r.id,
                                                                                      ),
                                                                                  disabled:
                                                                                    O.isPending,
                                                                                  children:
                                                                                    e.jsxDEV(
                                                                                      X,
                                                                                      {
                                                                                        className:
                                                                                          "h-3 w-3",
                                                                                      },
                                                                                      void 0,
                                                                                      !1,
                                                                                      {
                                                                                        fileName:
                                                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                        lineNumber: 448,
                                                                                        columnNumber: 33,
                                                                                      },
                                                                                      this,
                                                                                    ),
                                                                                },
                                                                                void 0,
                                                                                !1,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                  lineNumber: 441,
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
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 437,
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
                                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                    lineNumber: 432,
                                                                    columnNumber: 27,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  L,
                                                                  {
                                                                    className:
                                                                      "flex items-center gap-2",
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        Z,
                                                                        {
                                                                          className:
                                                                            "h-4 w-4",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 453,
                                                                          columnNumber: 29,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      "Target: ",
                                                                      new Date(
                                                                        r.targetDate,
                                                                      ).toLocaleDateString(),
                                                                    ],
                                                                  },
                                                                  void 0,
                                                                  !0,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                    lineNumber: 452,
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
                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                              lineNumber: 431,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            o,
                                                            {
                                                              className:
                                                                "space-y-4",
                                                              children: [
                                                                e.jsxDEV(
                                                                  "div",
                                                                  {
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        "div",
                                                                        {
                                                                          className:
                                                                            "flex items-center justify-between text-sm mb-1",
                                                                          children:
                                                                            [
                                                                              e.jsxDEV(
                                                                                "span",
                                                                                {
                                                                                  children:
                                                                                    "Progress",
                                                                                },
                                                                                void 0,
                                                                                !1,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                  lineNumber: 460,
                                                                                  columnNumber: 31,
                                                                                },
                                                                                this,
                                                                              ),
                                                                              e.jsxDEV(
                                                                                "span",
                                                                                {
                                                                                  children:
                                                                                    [
                                                                                      r.progress,
                                                                                      "%",
                                                                                    ],
                                                                                },
                                                                                void 0,
                                                                                !0,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                  lineNumber: 461,
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
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 459,
                                                                          columnNumber: 29,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        Ie,
                                                                        {
                                                                          value:
                                                                            r.progress,
                                                                          className:
                                                                            "h-2",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 463,
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
                                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                    lineNumber: 458,
                                                                    columnNumber: 27,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  "div",
                                                                  {
                                                                    className:
                                                                      "space-y-2",
                                                                    children:
                                                                      r.milestones
                                                                        .slice(
                                                                          0,
                                                                          3,
                                                                        )
                                                                        .map(
                                                                          (s) =>
                                                                            e.jsxDEV(
                                                                              "div",
                                                                              {
                                                                                className:
                                                                                  "flex items-center gap-2 text-sm",
                                                                                children:
                                                                                  [
                                                                                    s.completed
                                                                                      ? e.jsxDEV(
                                                                                          fe,
                                                                                          {
                                                                                            className:
                                                                                              "h-4 w-4 text-green-500",
                                                                                          },
                                                                                          void 0,
                                                                                          !1,
                                                                                          {
                                                                                            fileName:
                                                                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                            lineNumber: 470,
                                                                                            columnNumber: 35,
                                                                                          },
                                                                                          this,
                                                                                        )
                                                                                      : e.jsxDEV(
                                                                                          Ce,
                                                                                          {
                                                                                            className:
                                                                                              "h-4 w-4 text-muted-foreground",
                                                                                          },
                                                                                          void 0,
                                                                                          !1,
                                                                                          {
                                                                                            fileName:
                                                                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                            lineNumber: 472,
                                                                                            columnNumber: 35,
                                                                                          },
                                                                                          this,
                                                                                        ),
                                                                                    e.jsxDEV(
                                                                                      "span",
                                                                                      {
                                                                                        className:
                                                                                          s.completed
                                                                                            ? "line-through text-muted-foreground"
                                                                                            : "",
                                                                                        children:
                                                                                          s.title,
                                                                                      },
                                                                                      void 0,
                                                                                      !1,
                                                                                      {
                                                                                        fileName:
                                                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                        lineNumber: 474,
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
                                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                lineNumber: 468,
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
                                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                    lineNumber: 466,
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
                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                              lineNumber: 457,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                        ],
                                                      },
                                                      r.id,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                        lineNumber: 430,
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
                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                  lineNumber: 428,
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
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 371,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    G,
                                    {
                                      value: "insights",
                                      className: "space-y-4",
                                      children: te
                                        ? e.jsxDEV(
                                            "div",
                                            {
                                              className: "space-y-4",
                                              children: [
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "grid md:grid-cols-2 gap-4",
                                                    children: [1, 2, 3, 4].map(
                                                      (r) =>
                                                        e.jsxDEV(
                                                          i,
                                                          {
                                                            children: [
                                                              e.jsxDEV(
                                                                l,
                                                                {
                                                                  children:
                                                                    e.jsxDEV(
                                                                      "div",
                                                                      {
                                                                        className:
                                                                          "flex items-center gap-2",
                                                                        children:
                                                                          [
                                                                            e.jsxDEV(
                                                                              a,
                                                                              {
                                                                                className:
                                                                                  "h-5 w-5",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                lineNumber: 495,
                                                                                columnNumber: 31,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              a,
                                                                              {
                                                                                className:
                                                                                  "h-4 w-28",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                lineNumber: 496,
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
                                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                        lineNumber: 494,
                                                                        columnNumber: 29,
                                                                      },
                                                                      this,
                                                                    ),
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                  lineNumber: 493,
                                                                  columnNumber: 27,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                o,
                                                                {
                                                                  children: [
                                                                    e.jsxDEV(
                                                                      a,
                                                                      {
                                                                        className:
                                                                          "h-8 w-20 mb-1",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                        lineNumber: 500,
                                                                        columnNumber: 29,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    e.jsxDEV(
                                                                      a,
                                                                      {
                                                                        className:
                                                                          "h-3 w-36",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                        lineNumber: 501,
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
                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                  lineNumber: 499,
                                                                  columnNumber: 27,
                                                                },
                                                                this,
                                                              ),
                                                            ],
                                                          },
                                                          r,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                            lineNumber: 492,
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
                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                    lineNumber: 490,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  i,
                                                  {
                                                    children: [
                                                      e.jsxDEV(
                                                        l,
                                                        {
                                                          children: [
                                                            e.jsxDEV(
                                                              a,
                                                              {
                                                                className:
                                                                  "h-4 w-40",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 508,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              a,
                                                              {
                                                                className:
                                                                  "h-3 w-64 mt-1",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 509,
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
                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                          lineNumber: 507,
                                                          columnNumber: 23,
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
                                                                "flex items-center gap-4",
                                                              children: [
                                                                e.jsxDEV(
                                                                  a,
                                                                  {
                                                                    className:
                                                                      "h-24 w-24 rounded-full",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                    lineNumber: 513,
                                                                    columnNumber: 27,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  "div",
                                                                  {
                                                                    className:
                                                                      "flex-1 space-y-2",
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        a,
                                                                        {
                                                                          className:
                                                                            "h-4 w-32",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 515,
                                                                          columnNumber: 29,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        a,
                                                                        {
                                                                          className:
                                                                            "h-3 w-full",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 516,
                                                                          columnNumber: 29,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        a,
                                                                        {
                                                                          className:
                                                                            "h-3 w-3/4",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 517,
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
                                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                    lineNumber: 514,
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
                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                              lineNumber: 512,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                          lineNumber: 511,
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
                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                    lineNumber: 506,
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
                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                              lineNumber: 489,
                                              columnNumber: 19,
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
                                                      "grid md:grid-cols-2 gap-4",
                                                    children: [
                                                      e.jsxDEV(
                                                        i,
                                                        {
                                                          children: [
                                                            e.jsxDEV(
                                                              l,
                                                              {
                                                                children:
                                                                  e.jsxDEV(
                                                                    u,
                                                                    {
                                                                      className:
                                                                        "text-base flex items-center gap-2",
                                                                      children:
                                                                        [
                                                                          e.jsxDEV(
                                                                            _,
                                                                            {
                                                                              className:
                                                                                "h-5 w-5 text-green-500",
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                              lineNumber: 528,
                                                                              columnNumber: 25,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          "Growth Rate",
                                                                        ],
                                                                    },
                                                                    void 0,
                                                                    !0,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 527,
                                                                      columnNumber: 23,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 526,
                                                                columnNumber: 21,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              o,
                                                              {
                                                                children: [
                                                                  e.jsxDEV(
                                                                    "p",
                                                                    {
                                                                      className:
                                                                        "text-3xl font-bold",
                                                                      children:
                                                                        c?.growthRateDisplay ??
                                                                        "—",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 533,
                                                                      columnNumber: 23,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "p",
                                                                    {
                                                                      className:
                                                                        "text-sm text-muted-foreground",
                                                                      children:
                                                                        "streams vs last month",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
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
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 532,
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
                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                          lineNumber: 525,
                                                          columnNumber: 19,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        i,
                                                        {
                                                          children: [
                                                            e.jsxDEV(
                                                              l,
                                                              {
                                                                children:
                                                                  e.jsxDEV(
                                                                    u,
                                                                    {
                                                                      className:
                                                                        "text-base flex items-center gap-2",
                                                                      children:
                                                                        [
                                                                          e.jsxDEV(
                                                                            J,
                                                                            {
                                                                              className:
                                                                                "h-5 w-5 text-blue-500",
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                              lineNumber: 541,
                                                                              columnNumber: 25,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          "Engagement Score",
                                                                        ],
                                                                    },
                                                                    void 0,
                                                                    !0,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 540,
                                                                      columnNumber: 23,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 539,
                                                                columnNumber: 21,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              o,
                                                              {
                                                                children: [
                                                                  e.jsxDEV(
                                                                    "p",
                                                                    {
                                                                      className:
                                                                        "text-3xl font-bold",
                                                                      children:
                                                                        c !=
                                                                        null
                                                                          ? `${c.engagementScore}/100`
                                                                          : "—",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 546,
                                                                      columnNumber: 23,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "p",
                                                                    {
                                                                      className:
                                                                        "text-sm text-muted-foreground",
                                                                      children:
                                                                        c?.engagementScore >=
                                                                        70
                                                                          ? "Above average"
                                                                          : c?.engagementScore >=
                                                                              40
                                                                            ? "Average"
                                                                            : "Below average",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 547,
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
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 545,
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
                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                          lineNumber: 538,
                                                          columnNumber: 19,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        i,
                                                        {
                                                          children: [
                                                            e.jsxDEV(
                                                              l,
                                                              {
                                                                children:
                                                                  e.jsxDEV(
                                                                    u,
                                                                    {
                                                                      className:
                                                                        "text-base flex items-center gap-2",
                                                                      children:
                                                                        [
                                                                          e.jsxDEV(
                                                                            ee,
                                                                            {
                                                                              className:
                                                                                "h-5 w-5 text-purple-500",
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                              lineNumber: 556,
                                                                              columnNumber: 25,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          "Release Velocity",
                                                                        ],
                                                                    },
                                                                    void 0,
                                                                    !0,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 555,
                                                                      columnNumber: 23,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 554,
                                                                columnNumber: 21,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              o,
                                                              {
                                                                children: [
                                                                  e.jsxDEV(
                                                                    "p",
                                                                    {
                                                                      className:
                                                                        "text-3xl font-bold",
                                                                      children:
                                                                        c?.releaseVelocity ??
                                                                        "—",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 561,
                                                                      columnNumber: 23,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "p",
                                                                    {
                                                                      className:
                                                                        "text-sm text-muted-foreground",
                                                                      children:
                                                                        "tracks/month (90-day avg)",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 562,
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
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 560,
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
                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                          lineNumber: 553,
                                                          columnNumber: 19,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        i,
                                                        {
                                                          children: [
                                                            e.jsxDEV(
                                                              l,
                                                              {
                                                                children:
                                                                  e.jsxDEV(
                                                                    u,
                                                                    {
                                                                      className:
                                                                        "text-base flex items-center gap-2",
                                                                      children:
                                                                        [
                                                                          e.jsxDEV(
                                                                            A,
                                                                            {
                                                                              className:
                                                                                "h-5 w-5 text-amber-500",
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                              lineNumber: 569,
                                                                              columnNumber: 25,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          "Revenue Trend",
                                                                        ],
                                                                    },
                                                                    void 0,
                                                                    !0,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 568,
                                                                      columnNumber: 23,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 567,
                                                                columnNumber: 21,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              o,
                                                              {
                                                                children: [
                                                                  e.jsxDEV(
                                                                    "p",
                                                                    {
                                                                      className:
                                                                        "text-3xl font-bold",
                                                                      children:
                                                                        c?.revenueTrendDisplay ??
                                                                        "—",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 574,
                                                                      columnNumber: 23,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "p",
                                                                    {
                                                                      className:
                                                                        "text-sm text-muted-foreground",
                                                                      children:
                                                                        "vs last 30 days",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                      lineNumber: 575,
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
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 573,
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
                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                          lineNumber: 566,
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
                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                    lineNumber: 524,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  i,
                                                  {
                                                    children: [
                                                      e.jsxDEV(
                                                        l,
                                                        {
                                                          children: [
                                                            e.jsxDEV(
                                                              u,
                                                              {
                                                                className:
                                                                  "text-base",
                                                                children:
                                                                  "Career Health Score",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 582,
                                                                columnNumber: 21,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              L,
                                                              {
                                                                children:
                                                                  "Based on your activity and performance metrics",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                lineNumber: 583,
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
                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                          lineNumber: 581,
                                                          columnNumber: 19,
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
                                                                "flex items-center gap-4",
                                                              children: [
                                                                e.jsxDEV(
                                                                  "div",
                                                                  {
                                                                    className:
                                                                      "relative h-24 w-24",
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        "svg",
                                                                        {
                                                                          className:
                                                                            "h-full w-full -rotate-90",
                                                                          children:
                                                                            [
                                                                              e.jsxDEV(
                                                                                "circle",
                                                                                {
                                                                                  cx: "48",
                                                                                  cy: "48",
                                                                                  r: "40",
                                                                                  fill: "none",
                                                                                  stroke:
                                                                                    "currentColor",
                                                                                  strokeWidth:
                                                                                    "8",
                                                                                  className:
                                                                                    "text-muted",
                                                                                },
                                                                                void 0,
                                                                                !1,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                  lineNumber: 589,
                                                                                  columnNumber: 27,
                                                                                },
                                                                                this,
                                                                              ),
                                                                              e.jsxDEV(
                                                                                "circle",
                                                                                {
                                                                                  cx: "48",
                                                                                  cy: "48",
                                                                                  r: "40",
                                                                                  fill: "none",
                                                                                  stroke:
                                                                                    "currentColor",
                                                                                  strokeWidth:
                                                                                    "8",
                                                                                  strokeDasharray: `${(c?.careerHealthScore ?? 0) * 2.51} ${100 * 2.51}`,
                                                                                  className:
                                                                                    "text-primary",
                                                                                },
                                                                                void 0,
                                                                                !1,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                                  lineNumber: 598,
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
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 588,
                                                                          columnNumber: 25,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        "span",
                                                                        {
                                                                          className:
                                                                            "absolute inset-0 flex items-center justify-center text-2xl font-bold",
                                                                          children:
                                                                            c?.careerHealthScore ??
                                                                            "—",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 609,
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
                                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                    lineNumber: 587,
                                                                    columnNumber: 23,
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
                                                                        "h4",
                                                                        {
                                                                          className: `font-medium ${(c?.careerHealthScore ?? 0) >= 80 ? "text-green-500" : (c?.careerHealthScore ?? 0) >= 60 ? "text-blue-500" : "text-amber-500"}`,
                                                                          children:
                                                                            c?.healthLabel ??
                                                                            "Analyzing your career…",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 614,
                                                                          columnNumber: 25,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        "p",
                                                                        {
                                                                          className:
                                                                            "text-sm text-muted-foreground",
                                                                          children:
                                                                            (c?.careerHealthScore ??
                                                                              0) >=
                                                                            60
                                                                              ? "Your career is on a healthy trajectory. Focus on consistency and expanding your network."
                                                                              : "Post more content, release music regularly, and engage with your audience to boost your score.",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                          lineNumber: 617,
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
                                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                    lineNumber: 613,
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
                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                              lineNumber: 586,
                                                              columnNumber: 21,
                                                            },
                                                            this,
                                                          ),
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                          lineNumber: 585,
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
                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                    lineNumber: 580,
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
                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                              lineNumber: 524,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 487,
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
                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                lineNumber: 289,
                                columnNumber: 13,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                            lineNumber: 288,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-4",
                            children: [
                              e.jsxDEV(
                                i,
                                {
                                  className: "h-[600px] flex flex-col",
                                  children: [
                                    e.jsxDEV(
                                      l,
                                      {
                                        className: "border-b flex-shrink-0",
                                        children: e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "flex items-center justify-between",
                                            children: [
                                              e.jsxDEV(
                                                u,
                                                {
                                                  className:
                                                    "text-base flex items-center gap-2",
                                                  children: [
                                                    e.jsxDEV(
                                                      Y,
                                                      { className: "h-5 w-5" },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                        lineNumber: 636,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    "Chat with Max",
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                  lineNumber: 635,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                h,
                                                {
                                                  variant: "ghost",
                                                  size: "icon",
                                                  className:
                                                    "h-7 w-7 text-muted-foreground hover:text-destructive",
                                                  title: "Clear conversation",
                                                  onClick: () => $.mutate(),
                                                  disabled: $.isPending,
                                                  children: e.jsxDEV(
                                                    X,
                                                    {
                                                      className: "h-3.5 w-3.5",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                      lineNumber: 647,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                  lineNumber: 639,
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
                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                            lineNumber: 634,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                        lineNumber: 633,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        ref: w,
                                        className:
                                          "flex-1 overflow-y-auto p-4 space-y-4",
                                        children: [
                                          y.length === 0 &&
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex justify-center items-center h-full text-muted-foreground",
                                                children: e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "text-center",
                                                    children: [
                                                      e.jsxDEV(
                                                        Q,
                                                        {
                                                          className:
                                                            "h-10 w-10 mx-auto mb-2 opacity-20",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                          lineNumber: 655,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        "p",
                                                        {
                                                          className: "text-sm",
                                                          children:
                                                            "Loading your conversation...",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                          lineNumber: 656,
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
                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                    lineNumber: 654,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                lineNumber: 653,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                          y.map((r) =>
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className: `flex flex-col ${r.role === "user" ? "items-end" : "items-start"}`,
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className: `max-w-[88%] rounded-lg px-3 py-2 ${r.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`,
                                                      children: e.jsxDEV(
                                                        "p",
                                                        {
                                                          className:
                                                            "text-sm whitespace-pre-wrap",
                                                          children: r.content,
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                          lineNumber: 672,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                      lineNumber: 665,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  r.quickActions &&
                                                    r.quickActions.length > 0 &&
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex flex-wrap gap-1.5 mt-2 max-w-[88%]",
                                                        children:
                                                          r.quickActions.map(
                                                            (s, t) =>
                                                              e.jsxDEV(
                                                                "button",
                                                                {
                                                                  onClick: () =>
                                                                    C(s.prompt),
                                                                  className:
                                                                    "text-xs px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors",
                                                                  children:
                                                                    s.label,
                                                                },
                                                                t,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                  lineNumber: 678,
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
                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                        lineNumber: 676,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  r.proactiveSuggestions &&
                                                    r.proactiveSuggestions
                                                      .length > 0 &&
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex flex-col gap-1 mt-2 max-w-[88%]",
                                                        children:
                                                          r.proactiveSuggestions.map(
                                                            (s, t) =>
                                                              e.jsxDEV(
                                                                "div",
                                                                {
                                                                  className:
                                                                    "flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1",
                                                                  children: [
                                                                    e.jsxDEV(
                                                                      ge,
                                                                      {
                                                                        className:
                                                                          "h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                        lineNumber: 693,
                                                                        columnNumber: 29,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    s,
                                                                  ],
                                                                },
                                                                t,
                                                                !0,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                                  lineNumber: 692,
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
                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                        lineNumber: 690,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                ],
                                              },
                                              r.id,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                lineNumber: 661,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                          ),
                                          k.isPending &&
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className: "flex justify-start",
                                                children: e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "bg-muted rounded-lg p-3",
                                                    children: e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: "flex gap-1",
                                                        children: [
                                                          e.jsxDEV(
                                                            "span",
                                                            {
                                                              className:
                                                                "w-2 h-2 bg-muted-foreground rounded-full animate-bounce",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                              lineNumber: 705,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "span",
                                                            {
                                                              className:
                                                                "w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-100",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                              lineNumber: 706,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "span",
                                                            {
                                                              className:
                                                                "w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-200",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                              lineNumber: 707,
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
                                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                        lineNumber: 704,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                    lineNumber: 703,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                lineNumber: 702,
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
                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                        lineNumber: 651,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "p-4 border-t flex-shrink-0",
                                        children: e.jsxDEV(
                                          "div",
                                          {
                                            className: "flex gap-2",
                                            children: [
                                              e.jsxDEV(
                                                g,
                                                {
                                                  ref: B,
                                                  placeholder:
                                                    "Ask me anything...",
                                                  value: V,
                                                  onChange: (r) =>
                                                    M(r.target.value),
                                                  onKeyDown: (r) =>
                                                    r.key === "Enter" &&
                                                    !r.shiftKey &&
                                                    C(),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                  lineNumber: 715,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                h,
                                                {
                                                  size: "icon",
                                                  onClick: () => C(),
                                                  disabled:
                                                    k.isPending || !V.trim(),
                                                  children: e.jsxDEV(
                                                    we,
                                                    { className: "h-4 w-4" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                      lineNumber: 727,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                  lineNumber: 722,
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
                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                            lineNumber: 714,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                        lineNumber: 713,
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
                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                  lineNumber: 632,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                i,
                                {
                                  children: [
                                    e.jsxDEV(
                                      l,
                                      {
                                        children: e.jsxDEV(
                                          u,
                                          {
                                            className: "text-base",
                                            children: "Quick Questions",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                            lineNumber: 735,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                        lineNumber: 734,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      o,
                                      {
                                        className: "space-y-2",
                                        children: [
                                          {
                                            icon: T,
                                            label: "Set a career goal",
                                            prompt:
                                              "Help me set a music career goal for this quarter",
                                          },
                                          {
                                            icon: J,
                                            label: "Analyze my performance",
                                            prompt:
                                              "Give me an analysis of my music career performance and what I should focus on",
                                          },
                                          {
                                            icon: Z,
                                            label: "Plan my next release",
                                            prompt:
                                              "Help me plan my next music release strategy",
                                          },
                                          {
                                            icon: A,
                                            label: "Grow my revenue",
                                            prompt:
                                              "What are the best ways for me to grow my music revenue?",
                                          },
                                          {
                                            icon: re,
                                            label: "Build my fan base",
                                            prompt:
                                              "How can I grow my fan base and build a stronger community?",
                                          },
                                        ].map(
                                          ({ icon: r, label: s, prompt: t }) =>
                                            e.jsxDEV(
                                              h,
                                              {
                                                variant: "outline",
                                                className:
                                                  "w-full justify-start text-sm h-auto py-2",
                                                size: "sm",
                                                onClick: () => C(t),
                                                disabled: k.isPending,
                                                children: [
                                                  e.jsxDEV(
                                                    r,
                                                    {
                                                      className:
                                                        "h-4 w-4 mr-2 flex-shrink-0",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                      lineNumber: 753,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  s,
                                                ],
                                              },
                                              s,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                lineNumber: 745,
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
                                          "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                        lineNumber: 737,
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
                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                  lineNumber: 733,
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
                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                            lineNumber: 631,
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
                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                      lineNumber: 287,
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
                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                lineNumber: 274,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              Te,
              {
                open: ae,
                onOpenChange: v,
                children: e.jsxDEV(
                  Ae,
                  {
                    className: "max-w-md",
                    children: [
                      e.jsxDEV(
                        He,
                        {
                          children: e.jsxDEV(
                            Ge,
                            { children: "Create Career Goal" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                              lineNumber: 766,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                          lineNumber: 765,
                          columnNumber: 11,
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
                                    p,
                                    { children: "Goal Title *" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 770,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    g,
                                    {
                                      placeholder:
                                        "e.g. Reach 10,000 monthly listeners",
                                      value: n.title,
                                      onChange: (r) =>
                                        d((s) => ({
                                          ...s,
                                          title: r.target.value,
                                        })),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 771,
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
                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                lineNumber: 769,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "space-y-2",
                                children: [
                                  e.jsxDEV(
                                    p,
                                    { children: "Goal Type" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 778,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    Le,
                                    {
                                      value: n.goalType,
                                      onValueChange: (r) =>
                                        d((s) => ({ ...s, goalType: r })),
                                      children: [
                                        e.jsxDEV(
                                          Re,
                                          {
                                            children: e.jsxDEV(
                                              qe,
                                              {},
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                lineNumber: 784,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                            lineNumber: 783,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          Pe,
                                          {
                                            children: [
                                              e.jsxDEV(
                                                x,
                                                {
                                                  value: "growth",
                                                  children: "Fan Growth",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                  lineNumber: 787,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                x,
                                                {
                                                  value: "revenue",
                                                  children: "Revenue",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                  lineNumber: 788,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                x,
                                                {
                                                  value: "releases",
                                                  children: "Music Releases",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                  lineNumber: 789,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                x,
                                                {
                                                  value: "networking",
                                                  children: "Networking",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                  lineNumber: 790,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                x,
                                                {
                                                  value: "streams",
                                                  children: "Streams",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                  lineNumber: 791,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                x,
                                                {
                                                  value: "skills",
                                                  children: "Skills",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                                  lineNumber: 792,
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
                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                            lineNumber: 786,
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
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 779,
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
                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                lineNumber: 777,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "grid grid-cols-2 gap-3",
                                children: [
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className: "space-y-2",
                                      children: [
                                        e.jsxDEV(
                                          p,
                                          { children: "Target Value *" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                            lineNumber: 798,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          g,
                                          {
                                            type: "number",
                                            min: 1,
                                            placeholder: "e.g. 10000",
                                            value: n.targetValue,
                                            onChange: (r) =>
                                              d((s) => ({
                                                ...s,
                                                targetValue:
                                                  Number(r.target.value) || 1,
                                              })),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                            lineNumber: 799,
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
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 797,
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
                                          p,
                                          { children: "Unit" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                            lineNumber: 808,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          g,
                                          {
                                            placeholder:
                                              "e.g. listeners, streams",
                                            value: n.unit,
                                            onChange: (r) =>
                                              d((s) => ({
                                                ...s,
                                                unit: r.target.value,
                                              })),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                            lineNumber: 809,
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
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 807,
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
                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                lineNumber: 796,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "space-y-2",
                                children: [
                                  e.jsxDEV(
                                    p,
                                    { children: "Deadline" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 817,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    g,
                                    {
                                      type: "date",
                                      value: n.deadline,
                                      onChange: (r) =>
                                        d((s) => ({
                                          ...s,
                                          deadline: r.target.value,
                                        })),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 818,
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
                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                lineNumber: 816,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "space-y-2",
                                children: [
                                  e.jsxDEV(
                                    p,
                                    { children: "Description" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 825,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    Me,
                                    {
                                      placeholder:
                                        "Describe your goal and why it matters...",
                                      value: n.description,
                                      onChange: (r) =>
                                        d((s) => ({
                                          ...s,
                                          description: r.target.value,
                                        })),
                                      rows: 3,
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                      lineNumber: 826,
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
                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                lineNumber: 824,
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
                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                          lineNumber: 768,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        Fe,
                        {
                          children: [
                            e.jsxDEV(
                              h,
                              {
                                variant: "outline",
                                onClick: () => v(!1),
                                children: "Cancel",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                lineNumber: 835,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              h,
                              {
                                onClick: () => {
                                  if (!n.title.trim()) {
                                    N({
                                      title: "Title required",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  if (!n.targetValue || n.targetValue < 1) {
                                    N({
                                      title: "Target value must be at least 1",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  I.mutate({
                                    title: n.title,
                                    goalType: n.goalType,
                                    targetValue: n.targetValue,
                                    unit: n.unit || void 0,
                                    deadline: n.deadline
                                      ? new Date(n.deadline).toISOString()
                                      : void 0,
                                    description: n.description || void 0,
                                  });
                                },
                                disabled: I.isPending,
                                children: I.isPending
                                  ? "Creating..."
                                  : "Create Goal",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                                lineNumber: 836,
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
                            "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                          lineNumber: 834,
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
                      "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                    lineNumber: 764,
                    columnNumber: 9,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
                lineNumber: 763,
                columnNumber: 7,
              },
              this,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/CareerCoach.tsx",
          lineNumber: 273,
          columnNumber: 5,
        },
        this,
      )
    : (q("/login"), null);
}
export { Xe as default };
