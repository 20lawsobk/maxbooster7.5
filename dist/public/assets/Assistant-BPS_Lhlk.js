import {
  r as a,
  f as e,
  dI as z,
  bu as U,
  ap as W,
  y as K,
  aY as A,
  bQ as P,
  aO as G,
  b9 as B,
  aR as Q,
  b0 as J,
  d0 as Y,
} from "./vendor-react-31oK5L0i.js";
import { A as Z } from "./AppLayout-D2pri0rw.js";
import { B as _, j as f, S as X, b as k, I as ee } from "./studio-DOUfHW5v.js";
import { a as se } from "./index-D5xLbTBZ.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./TopBar-jcH3P98k.js";
import "./vendor-animation-CFQslDag.js";
const te = [
  { icon: G, text: "How do I use the DAW studio?", color: "text-purple-400" },
  {
    icon: B,
    text: "How does music distribution work?",
    color: "text-blue-400",
  },
  {
    icon: Q,
    text: "Tell me about the AI autopilot system",
    color: "text-amber-400",
  },
  { icon: J, text: "How do I monetize my music?", color: "text-green-400" },
  {
    icon: A,
    text: "What can Max Booster do for my career?",
    color: "text-cyan-400",
  },
  {
    icon: B,
    text: "How does the beat marketplace work?",
    color: "text-rose-400",
  },
];
function p(n) {
  return {
    id: "welcome",
    role: "assistant",
    content: n
      ? `Hey ${n}! I'm Max — your in-house AI assistant, built by the B-Lawz Music team. I remember our full conversation history across every session. Ask me anything about Max Booster — Studio, distribution, royalties, marketplace, social media, advertising, analytics, and more. What can I help you with today?`
      : "Hey there! I'm Max, your in-house AI assistant. Ask me anything about Max Booster — Studio, distribution, royalties, marketplace, social media, advertising, and more. What do you want to know?",
    timestamp: new Date(),
  };
}
async function g(n, m) {
  const i = await fetch(n, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...m,
  });
  if (!i.ok) throw new Error(`HTTP ${i.status}`);
  return i.json();
}
function de() {
  const { user: n } = se(),
    [m, i] = a.useState([]),
    [w, D] = a.useState(""),
    [u, j] = a.useState(!1),
    [E, V] = a.useState(!1),
    [S, d] = a.useState(!1),
    [I, N] = a.useState(0),
    [v, M] = a.useState(!1),
    C = a.useRef(null),
    y = a.useRef(null),
    T = a.useRef(null),
    c = a.useRef(!0),
    H = (s) => ({
      id: s.id,
      role: s.role,
      content: s.content,
      timestamp: new Date(s.createdAt),
    }),
    L = a.useCallback(async () => {
      if (!E) {
        if ((V(!0), !n)) {
          i([p()]);
          return;
        }
        try {
          c.current = !0;
          const s = await g("/api/assistant/history"),
            t = (s.messages || []).map(H);
          (d(s.hasMore ?? !1),
            N(s.total ?? t.length),
            i(t.length === 0 ? [p(n.username ?? void 0)] : t));
        } catch {
          i([p(n.username ?? void 0)]);
        }
      }
    }, [n, E]);
  (a.useEffect(() => {
    L();
  }, [L]),
    a.useEffect(() => {
      c.current &&
        y.current &&
        y.current.scrollIntoView({ behavior: "smooth" });
    }, [m, u]));
  const O = async () => {
      if (v || !S) return;
      const s = m.filter((l) => l.id !== "welcome");
      if (s.length === 0) return;
      const t = s[0].id,
        r = C.current,
        o = r?.scrollHeight ?? 0;
      (M(!0), (c.current = !1));
      try {
        const l = await g(
            `/api/assistant/history?before=${encodeURIComponent(t)}`,
          ),
          b = (l.messages || []).map(H);
        b.length > 0
          ? (d(l.hasMore ?? !1),
            i((x) => [...b, ...x]),
            requestAnimationFrame(() => {
              (r && (r.scrollTop = r.scrollHeight - o), (c.current = !0));
            }))
          : (d(!1), (c.current = !0));
      } catch {
        c.current = !0;
      } finally {
        M(!1);
      }
    },
    h = async (s) => {
      const t = (s ?? w).trim();
      if (!t || u) return;
      const r = {
        id: `optimistic-${Date.now()}`,
        role: "user",
        content: t,
        timestamp: new Date(),
      };
      ((c.current = !0), i((o) => [...o, r]), D(""), j(!0));
      try {
        const o = await g("/api/assistant/chat", {
            method: "POST",
            body: JSON.stringify({ message: t }),
          }),
          l = {
            id: o.messageId ?? r.id,
            role: "user",
            content: t,
            timestamp: r.timestamp,
          },
          b = {
            id: o.assistantMessageId ?? `ai-${Date.now()}`,
            role: "assistant",
            content: o.content,
            timestamp: new Date(),
            quickActions: o.quickActions,
            proactiveSuggestions: o.proactiveSuggestions,
          };
        (i((x) => [...x.filter((F) => F.id !== r.id), l, b]), N((x) => x + 2));
      } catch {
        i((o) => [
          ...o.filter((l) => l.id !== r.id),
          r,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content:
              "I'm having trouble connecting right now. Please check your connection and try again.",
            timestamp: new Date(),
          },
        ]);
      } finally {
        (j(!1), setTimeout(() => T.current?.focus(), 50));
      }
    },
    $ = async () => {
      if (!n) {
        (i([p()]), d(!1), N(0));
        return;
      }
      try {
        await g("/api/assistant/history", { method: "DELETE" });
      } catch {}
      (V(!1), d(!1), N(0), i([p(n.username ?? void 0)]));
    },
    R = m.filter((s) => s.id !== "welcome").length,
    q = R === 0 && !u;
  return e.jsxDEV(
    Z,
    {
      children: e.jsxDEV(
        "div",
        {
          className:
            "flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto w-full px-4 py-4 gap-0",
          children: [
            e.jsxDEV(
              "div",
              {
                className:
                  "flex items-center justify-between mb-4 flex-shrink-0",
                children: [
                  e.jsxDEV(
                    "div",
                    {
                      className: "flex items-center gap-3",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className:
                              "h-10 w-10 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg",
                            children: e.jsxDEV(
                              z,
                              { className: "h-5 w-5 text-white" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                lineNumber: 221,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Assistant.tsx",
                            lineNumber: 220,
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
                                    "text-lg font-semibold text-white flex items-center gap-2",
                                  children: [
                                    "Max",
                                    e.jsxDEV(
                                      _,
                                      {
                                        variant: "outline",
                                        className:
                                          "text-xs border-cyan-500/40 text-cyan-400 font-normal",
                                        children: "In-House AI",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                        lineNumber: 226,
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
                                    "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                  lineNumber: 224,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-xs text-gray-400",
                                  children: n
                                    ? I > 0
                                      ? `${I.toLocaleString()} messages · Full history saved`
                                      : "Full history saved across sessions"
                                    : "Sign in to save your conversation history",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                  lineNumber: 230,
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
                              "/home/runner/workspace/client/src/pages/Assistant.tsx",
                            lineNumber: 223,
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
                        "/home/runner/workspace/client/src/pages/Assistant.tsx",
                      lineNumber: 219,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  n &&
                    R > 0 &&
                    e.jsxDEV(
                      f,
                      {
                        variant: "ghost",
                        size: "sm",
                        className:
                          "text-gray-400 hover:text-red-400 gap-1.5 text-xs",
                        onClick: $,
                        children: [
                          e.jsxDEV(
                            U,
                            { className: "h-3.5 w-3.5" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Assistant.tsx",
                              lineNumber: 247,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          "Clear history",
                        ],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Assistant.tsx",
                        lineNumber: 241,
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
                  "/home/runner/workspace/client/src/pages/Assistant.tsx",
                lineNumber: 218,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                className:
                  "flex-1 min-h-0 rounded-xl border border-gray-700/50 bg-[#141414] overflow-hidden flex flex-col",
                children: [
                  e.jsxDEV(
                    X,
                    {
                      ref: C,
                      className: "flex-1 p-4",
                      children: e.jsxDEV(
                        "div",
                        {
                          className: "space-y-4 pb-2",
                          children: [
                            S &&
                              e.jsxDEV(
                                "div",
                                {
                                  className: "flex justify-center",
                                  children: e.jsxDEV(
                                    f,
                                    {
                                      variant: "ghost",
                                      size: "sm",
                                      className:
                                        "text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 gap-1.5",
                                      onClick: O,
                                      disabled: v,
                                      children: v
                                        ? e.jsxDEV(
                                            e.Fragment,
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  W,
                                                  {
                                                    className:
                                                      "h-3 w-3 animate-spin",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                                    lineNumber: 268,
                                                    columnNumber: 27,
                                                  },
                                                  this,
                                                ),
                                                "Loading earlier messages…",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                              lineNumber: 268,
                                              columnNumber: 25,
                                            },
                                            this,
                                          )
                                        : e.jsxDEV(
                                            e.Fragment,
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  K,
                                                  { className: "h-3 w-3" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                                    lineNumber: 269,
                                                    columnNumber: 27,
                                                  },
                                                  this,
                                                ),
                                                "Load earlier messages",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                              lineNumber: 269,
                                              columnNumber: 25,
                                            },
                                            this,
                                          ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                      lineNumber: 260,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                  lineNumber: 259,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                            m.map((s) =>
                              e.jsxDEV(
                                "div",
                                {
                                  className: k(
                                    "flex",
                                    s.role === "user"
                                      ? "justify-end"
                                      : "justify-start",
                                  ),
                                  children: [
                                    s.role === "assistant" &&
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "h-7 w-7 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center mr-2 mt-1 flex-shrink-0",
                                          children: e.jsxDEV(
                                            A,
                                            {
                                              className:
                                                "h-3.5 w-3.5 text-white",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                              lineNumber: 281,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                          lineNumber: 280,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "flex flex-col gap-2 max-w-[75%]",
                                        children: [
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className: k(
                                                "rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed",
                                                s.role === "user"
                                                  ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-tr-sm"
                                                  : "bg-[#1e1e1e] text-gray-100 border border-gray-700/60 rounded-tl-sm",
                                              ),
                                              children: s.content,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                              lineNumber: 285,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          s.role === "assistant" &&
                                            s.quickActions &&
                                            s.quickActions.length > 0 &&
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex flex-wrap gap-1.5 ml-1",
                                                children: s.quickActions.map(
                                                  (t, r) =>
                                                    e.jsxDEV(
                                                      f,
                                                      {
                                                        variant: "outline",
                                                        size: "sm",
                                                        className:
                                                          "text-xs h-7 border-gray-700 hover:border-cyan-500/50 hover:bg-cyan-500/10 text-gray-300",
                                                        onClick: () =>
                                                          h(t.prompt),
                                                        children: t.label,
                                                      },
                                                      r,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                                        lineNumber: 299,
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
                                                  "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                                lineNumber: 297,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          s.role === "assistant" &&
                                            s.proactiveSuggestions &&
                                            s.proactiveSuggestions.length > 0 &&
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex flex-col gap-1 ml-1",
                                                children: s.proactiveSuggestions
                                                  .slice(0, 2)
                                                  .map((t, r) =>
                                                    e.jsxDEV(
                                                      "button",
                                                      {
                                                        className:
                                                          "text-left text-xs text-cyan-400/80 hover:text-cyan-300 flex items-center gap-1",
                                                        onClick: () => h(t),
                                                        children: [
                                                          e.jsxDEV(
                                                            P,
                                                            {
                                                              className:
                                                                "h-3 w-3 flex-shrink-0",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                                              lineNumber: 320,
                                                              columnNumber: 29,
                                                            },
                                                            this,
                                                          ),
                                                          t,
                                                        ],
                                                      },
                                                      r,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                                        lineNumber: 315,
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
                                                  "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                                lineNumber: 313,
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
                                          "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                        lineNumber: 284,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  ],
                                },
                                s.id,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                  lineNumber: 275,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                            ),
                            u &&
                              e.jsxDEV(
                                "div",
                                {
                                  className: "flex justify-start",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "h-7 w-7 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center mr-2 flex-shrink-0",
                                        children: e.jsxDEV(
                                          A,
                                          {
                                            className: "h-3.5 w-3.5 text-white",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                            lineNumber: 333,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                        lineNumber: 332,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "bg-[#1e1e1e] border border-gray-700/60 rounded-2xl rounded-tl-sm px-4 py-3",
                                        children: e.jsxDEV(
                                          "div",
                                          {
                                            className: "flex space-x-1.5",
                                            children: [
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "w-2 h-2 bg-cyan-400 rounded-full animate-bounce",
                                                  style: {
                                                    animationDelay: "0ms",
                                                  },
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                                  lineNumber: 337,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "w-2 h-2 bg-cyan-400 rounded-full animate-bounce",
                                                  style: {
                                                    animationDelay: "150ms",
                                                  },
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                                  lineNumber: 338,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "w-2 h-2 bg-cyan-400 rounded-full animate-bounce",
                                                  style: {
                                                    animationDelay: "300ms",
                                                  },
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                                  lineNumber: 339,
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
                                              "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                            lineNumber: 336,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                        lineNumber: 335,
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
                                    "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                  lineNumber: 331,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                            q &&
                              e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6",
                                  children: te.map((s, t) =>
                                    e.jsxDEV(
                                      f,
                                      {
                                        variant: "outline",
                                        className:
                                          "justify-start text-left h-auto py-3 px-4 border-gray-700 hover:border-cyan-500/50 hover:bg-cyan-500/10 gap-3",
                                        onClick: () => h(s.text),
                                        children: [
                                          e.jsxDEV(
                                            s.icon,
                                            {
                                              className: k(
                                                "h-4 w-4 flex-shrink-0",
                                                s.color,
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                              lineNumber: 354,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "span",
                                            {
                                              className:
                                                "text-sm text-gray-300",
                                              children: s.text,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                              lineNumber: 355,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                        ],
                                      },
                                      t,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                        lineNumber: 348,
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
                                    "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                  lineNumber: 346,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                            e.jsxDEV(
                              "div",
                              { ref: y },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                lineNumber: 361,
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
                            "/home/runner/workspace/client/src/pages/Assistant.tsx",
                          lineNumber: 256,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Assistant.tsx",
                      lineNumber: 255,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className:
                        "border-t border-gray-700/50 p-4 flex-shrink-0",
                      children: e.jsxDEV(
                        "div",
                        {
                          className: "flex items-center gap-2",
                          children: [
                            e.jsxDEV(
                              ee,
                              {
                                ref: T,
                                value: w,
                                onChange: (s) => D(s.target.value),
                                onKeyDown: (s) => {
                                  s.key === "Enter" &&
                                    !s.shiftKey &&
                                    (s.preventDefault(), h());
                                },
                                placeholder:
                                  "Ask Max anything about your music career…",
                                className:
                                  "flex-1 bg-[#1e1e1e] border-gray-700 text-white placeholder:text-gray-500 focus:border-cyan-500/50",
                                disabled: u,
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                lineNumber: 368,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              f,
                              {
                                onClick: () => h(),
                                disabled: !w.trim() || u,
                                className:
                                  "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 px-4",
                                children: e.jsxDEV(
                                  Y,
                                  { className: "h-4 w-4" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Assistant.tsx",
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
                                  "/home/runner/workspace/client/src/pages/Assistant.tsx",
                                lineNumber: 382,
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
                            "/home/runner/workspace/client/src/pages/Assistant.tsx",
                          lineNumber: 367,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Assistant.tsx",
                      lineNumber: 366,
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
                  "/home/runner/workspace/client/src/pages/Assistant.tsx",
                lineNumber: 254,
                columnNumber: 9,
              },
              this,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Assistant.tsx",
          lineNumber: 215,
          columnNumber: 7,
        },
        this,
      ),
    },
    void 0,
    !1,
    {
      fileName: "/home/runner/workspace/client/src/pages/Assistant.tsx",
      lineNumber: 214,
      columnNumber: 5,
    },
    this,
  );
}
export { de as default };
