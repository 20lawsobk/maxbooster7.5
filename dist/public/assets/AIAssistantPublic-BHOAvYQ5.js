import {
  r as n,
  f as e,
  aY as w,
  b_ as g,
  cq as k,
  ac as I,
  aO as D,
  b9 as y,
  aR as j,
  b0 as E,
  d0 as P,
} from "./vendor-react-31oK5L0i.js";
import {
  j as m,
  C as V,
  d as S,
  f as C,
  h as M,
  S as T,
  b as h,
  I as z,
  k as H,
} from "./studio-DOUfHW5v.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
const O = [
    { icon: D, text: "What is Max Booster?", color: "text-purple-400" },
    { icon: y, text: "How does distribution work?", color: "text-blue-400" },
    { icon: j, text: "Tell me about the AI features", color: "text-amber-400" },
    { icon: E, text: "How do I sell beats?", color: "text-green-400" },
  ],
  B =
    "Hey there! I'm Max, your AI assistant — built entirely in-house by the B-Lawz Music team. Ask me anything about Max Booster: the Studio, distribution, social media, advertising, marketplace, analytics, and more. What do you want to know?";
async function R(i) {
  const o = H(),
    t = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(o ? { "x-csrf-token": o } : {}),
      },
      credentials: "include",
      body: JSON.stringify({ message: i }),
    });
  if (!t.ok) throw new Error(`HTTP ${t.status}`);
  return (await t.json()).content;
}
function q() {
  const [i, o] = n.useState(!1),
    [t, N] = n.useState(!1),
    [a, u] = n.useState([]),
    [b, x] = n.useState(""),
    [r, f] = n.useState(!1),
    p = n.useRef(null);
  (n.useEffect(() => {
    p.current && (p.current.scrollTop = p.current.scrollHeight);
  }, [a, r]),
    n.useEffect(() => {
      i &&
        a.length === 0 &&
        u([
          {
            id: "welcome",
            role: "assistant",
            content: B,
            timestamp: new Date(),
          },
        ]);
    }, [i, a.length]));
  const d = async (s) => {
    const l = (s || b).trim();
    if (!l || r) return;
    const A = {
      id: Date.now().toString(),
      role: "user",
      content: l,
      timestamp: new Date(),
    };
    (u((c) => [...c, A]), x(""), f(!0));
    try {
      const c = await R(l);
      u((v) => [
        ...v,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: c,
          timestamp: new Date(),
        },
      ]);
    } catch {
      u((c) => [
        ...c,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content:
            "I'm having trouble connecting right now. Please try again in a moment.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      f(!1);
    }
  };
  return i
    ? e.jsxDEV(
        "div",
        {
          className: h(
            "fixed bottom-20 lg:bottom-6 right-2 sm:right-6 z-[45] transition-all duration-200",
            t ? "w-[calc(100vw-1rem)] sm:w-80" : "w-[calc(100vw-1rem)] sm:w-96",
          ),
          children: e.jsxDEV(
            V,
            {
              className:
                "shadow-2xl border-2 border-purple-500/20 bg-[#1a1a1a]",
              children: [
                e.jsxDEV(
                  S,
                  {
                    className:
                      "bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-b border-purple-500/20 p-4",
                    children: e.jsxDEV(
                      "div",
                      {
                        className: "flex items-center justify-between",
                        children: [
                          e.jsxDEV(
                            C,
                            {
                              className: "flex items-center gap-2 text-white",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "h-8 w-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center",
                                    children: e.jsxDEV(
                                      w,
                                      { className: "h-4 w-4 text-white" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                        lineNumber: 130,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                    lineNumber: 129,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: "text-sm font-semibold",
                                          children: "Max",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                          lineNumber: 133,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "text-xs text-gray-400 font-normal",
                                          children: "In-House AI Assistant",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                          lineNumber: 134,
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
                                      "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                    lineNumber: 132,
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
                                "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                              lineNumber: 128,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center gap-1",
                              children: [
                                e.jsxDEV(
                                  m,
                                  {
                                    variant: "ghost",
                                    size: "sm",
                                    className:
                                      "h-8 w-8 p-0 text-gray-400 hover:text-white",
                                    onClick: () => N(!t),
                                    children: t
                                      ? e.jsxDEV(
                                          g,
                                          { className: "h-4 w-4" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                            lineNumber: 144,
                                            columnNumber: 32,
                                          },
                                          this,
                                        )
                                      : e.jsxDEV(
                                          k,
                                          { className: "h-4 w-4" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                            lineNumber: 144,
                                            columnNumber: 68,
                                          },
                                          this,
                                        ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                    lineNumber: 138,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  m,
                                  {
                                    variant: "ghost",
                                    size: "sm",
                                    className:
                                      "h-8 w-8 p-0 text-gray-400 hover:text-white",
                                    onClick: () => o(!1),
                                    children: e.jsxDEV(
                                      I,
                                      { className: "h-4 w-4" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                        lineNumber: 152,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                    lineNumber: 146,
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
                                "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                              lineNumber: 137,
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
                          "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                        lineNumber: 127,
                        columnNumber: 11,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                    lineNumber: 126,
                    columnNumber: 9,
                  },
                  this,
                ),
                !t &&
                  e.jsxDEV(
                    M,
                    {
                      className: "p-0",
                      children: [
                        e.jsxDEV(
                          T,
                          {
                            ref: p,
                            className: "h-96 p-4",
                            children: e.jsxDEV(
                              "div",
                              {
                                className: "space-y-4",
                                children: [
                                  a.map((s) =>
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: h(
                                          "flex",
                                          s.role === "user"
                                            ? "justify-end"
                                            : "justify-start",
                                        ),
                                        children: e.jsxDEV(
                                          "div",
                                          {
                                            className: h(
                                              "max-w-[80%] rounded-lg px-4 py-2 whitespace-pre-wrap text-sm",
                                              s.role === "user"
                                                ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                                                : "bg-[#252525] text-gray-100 border border-gray-700",
                                            ),
                                            children: s.content,
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                            lineNumber: 170,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      s.id,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                        lineNumber: 163,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  ),
                                  r &&
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "flex justify-start",
                                        children: e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "bg-[#252525] text-gray-100 border border-gray-700 rounded-lg px-4 py-2",
                                            children: e.jsxDEV(
                                              "div",
                                              {
                                                className: "flex space-x-2",
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "w-2 h-2 bg-purple-400 rounded-full animate-bounce",
                                                      style: {
                                                        animationDelay: "0ms",
                                                      },
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                                      lineNumber: 187,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "w-2 h-2 bg-purple-400 rounded-full animate-bounce",
                                                      style: {
                                                        animationDelay: "150ms",
                                                      },
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                                      lineNumber: 188,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "w-2 h-2 bg-purple-400 rounded-full animate-bounce",
                                                      style: {
                                                        animationDelay: "300ms",
                                                      },
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                                      lineNumber: 189,
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
                                                  "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                                lineNumber: 186,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                            lineNumber: 185,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                        lineNumber: 184,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  a.length === 1 &&
                                    !r &&
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "grid grid-cols-1 gap-2 mt-4",
                                        children: O.map((s, l) =>
                                          e.jsxDEV(
                                            m,
                                            {
                                              variant: "outline",
                                              size: "sm",
                                              className:
                                                "justify-start text-left h-auto py-2 px-3 border-gray-700 hover:border-purple-500/50 hover:bg-purple-500/10",
                                              onClick: () => d(s.text),
                                              children: [
                                                e.jsxDEV(
                                                  s.icon,
                                                  {
                                                    className: h(
                                                      "h-4 w-4 mr-2 flex-shrink-0",
                                                      s.color,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                                    lineNumber: 205,
                                                    columnNumber: 25,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "span",
                                                  {
                                                    className:
                                                      "text-xs text-gray-300",
                                                    children: s.text,
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                                    lineNumber: 206,
                                                    columnNumber: 25,
                                                  },
                                                  this,
                                                ),
                                              ],
                                            },
                                            l,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                              lineNumber: 198,
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
                                          "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                        lineNumber: 196,
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
                                  "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                lineNumber: 161,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                            lineNumber: 160,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "border-t border-gray-700 p-4",
                            children: [
                              e.jsxDEV(
                                "div",
                                {
                                  className: "flex items-center gap-2",
                                  children: [
                                    e.jsxDEV(
                                      z,
                                      {
                                        value: b,
                                        onChange: (s) => x(s.target.value),
                                        onKeyDown: (s) => {
                                          s.key === "Enter" &&
                                            !s.shiftKey &&
                                            (s.preventDefault(), d());
                                        },
                                        placeholder: "Ask me anything...",
                                        className:
                                          "flex-1 bg-[#252525] border-gray-700 text-white placeholder:text-gray-500",
                                        disabled: r,
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                        lineNumber: 216,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      m,
                                      {
                                        onClick: () => d(),
                                        disabled: !b.trim() || r,
                                        size: "sm",
                                        className:
                                          "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600",
                                        children: e.jsxDEV(
                                          P,
                                          { className: "h-4 w-4" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                            lineNumber: 235,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                        lineNumber: 229,
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
                                    "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                  lineNumber: 215,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "mt-2 text-xs text-gray-500 text-center",
                                  children:
                                    "In-house AI • Sign in to save your conversation",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                                  lineNumber: 238,
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
                              "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                            lineNumber: 214,
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
                        "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                      lineNumber: 159,
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
                "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
              lineNumber: 125,
              columnNumber: 7,
            },
            this,
          ),
        },
        void 0,
        !1,
        {
          fileName:
            "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
          lineNumber: 121,
          columnNumber: 5,
        },
        this,
      )
    : e.jsxDEV(
        "div",
        {
          className: "fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-[45]",
          children: e.jsxDEV(
            m,
            {
              onClick: () => o(!0),
              size: "lg",
              className:
                "h-14 w-14 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg hover:shadow-xl transition-all duration-200 group",
              "data-testid": "ai-assistant-bubble-public",
              children: e.jsxDEV(
                w,
                {
                  className:
                    "h-6 w-6 text-white group-hover:scale-110 transition-transform",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
                  lineNumber: 114,
                  columnNumber: 11,
                },
                this,
              ),
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
              lineNumber: 108,
              columnNumber: 9,
            },
            this,
          ),
        },
        void 0,
        !1,
        {
          fileName:
            "/home/runner/workspace/client/src/components/support/AIAssistantPublic.tsx",
          lineNumber: 107,
          columnNumber: 7,
        },
        this,
      );
}
export { q as AIAssistantPublic };
