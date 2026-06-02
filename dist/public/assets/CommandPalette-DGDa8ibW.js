import {
  r as o,
  f as e,
  aK as C,
  ac as T,
  a_ as U,
  bb as y,
  d3 as K,
  c4 as z,
  al as _,
  ai as S,
  bv as I,
  cU as q,
  d4 as F,
  cT as P,
  b7 as Q,
  d5 as $,
  aO as B,
  cz as G,
  d6 as H,
} from "./vendor-react-31oK5L0i.js";
import { I as X, S as Y, b as v, z as w } from "./studio-DOUfHW5v.js";
import { c as J } from "./index-D5xLbTBZ.js";
import { A as L, m as V } from "./vendor-animation-CFQslDag.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
const W = { navigation: y, actions: S, help: z, view: I },
  Z = {
    "go-to-dashboard": G,
    "go-to-studio": B,
    "go-to-projects": $,
    "go-to-analytics": Q,
    "go-to-distribution": P,
    "go-to-social": P,
    "go-to-marketplace": F,
    "go-to-royalties": q,
    "go-to-settings": I,
    "new-project": S,
    "upload-file": _,
    "show-shortcuts": z,
    "toggle-theme": K,
  };
function re({ className: r }) {
  const { isOpen: d, close: a, search: u, execute: N, recentCommands: t } = J(),
    [m, g] = o.useState(""),
    [c, x] = o.useState(0),
    E = o.useRef(null),
    b = o.useRef(null),
    M = w(),
    h = o.useMemo(() => (m.trim() ? u(m) : []), [m, u]),
    i = o.useMemo(
      () => (m.trim() ? h : t.length > 0 ? t : u("")),
      [m, h, t, u],
    ),
    D = o.useMemo(() => {
      if (m.trim()) return null;
      const n = {};
      return (
        i.forEach((s) => {
          const l = s.category;
          (n[l] || (n[l] = []), n[l].push(s));
        }),
        n
      );
    }, [m, i]);
  (o.useEffect(() => {
    d && (g(""), x(0), setTimeout(() => E.current?.focus(), 50));
  }, [d]),
    o.useEffect(() => {
      x(0);
    }, [m]));
  const p = o.useCallback(
      async (n) => {
        (a(), await N(n.id));
      },
      [a, N],
    ),
    R = o.useCallback(
      (n) => {
        switch (n.key) {
          case "ArrowDown":
            (n.preventDefault(), x((s) => Math.min(s + 1, i.length - 1)));
            break;
          case "ArrowUp":
            (n.preventDefault(), x((s) => Math.max(s - 1, 0)));
            break;
          case "Enter":
            (n.preventDefault(), i[c] && p(i[c]));
            break;
          case "Escape":
            (n.preventDefault(), a());
            break;
        }
      },
      [i, c, p, a],
    );
  o.useEffect(() => {
    b.current &&
      b.current
        .querySelector(`[data-index="${c}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [c]);
  const f = (n) => Z[n.id] || W[n.category] || H,
    A = (n) =>
      n
        .split(/[-_]/)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");
  return e.jsxDEV(
    L,
    {
      children:
        d &&
        e.jsxDEV(
          e.Fragment,
          {
            children: [
              e.jsxDEV(
                V.div,
                {
                  initial: { opacity: 0 },
                  animate: { opacity: 1 },
                  exit: { opacity: 0 },
                  transition: { duration: 0.15 },
                  className: "fixed inset-0 bg-black/60 backdrop-blur-sm z-50",
                  onClick: a,
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                  lineNumber: 151,
                  columnNumber: 11,
                },
                this,
              ),
              e.jsxDEV(
                V.div,
                {
                  initial: { opacity: 0, scale: 0.95, y: -20 },
                  animate: { opacity: 1, scale: 1, y: 0 },
                  exit: { opacity: 0, scale: 0.95, y: -20 },
                  transition: { duration: 0.15 },
                  className: v(
                    "fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-xl",
                    "bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden",
                    r,
                  ),
                  role: "dialog",
                  "aria-modal": "true",
                  "aria-label": "Command palette",
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className:
                          "flex items-center gap-3 p-4 border-b border-zinc-800",
                        children: [
                          e.jsxDEV(
                            C,
                            {
                              className: "w-5 h-5 text-zinc-400 flex-shrink-0",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                              lineNumber: 175,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            X,
                            {
                              ref: E,
                              value: m,
                              onChange: (n) => g(n.target.value),
                              onKeyDown: R,
                              placeholder: "Type a command or search...",
                              className:
                                "flex-1 border-0 bg-transparent p-0 focus-visible:ring-0 text-lg placeholder:text-zinc-500",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                              lineNumber: 176,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "button",
                            {
                              onClick: a,
                              className:
                                "p-1 hover:bg-zinc-800 rounded transition-colors",
                              "aria-label": "Close command palette",
                              children: e.jsxDEV(
                                T,
                                { className: "w-5 h-5 text-zinc-400" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                  lineNumber: 189,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                              lineNumber: 184,
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
                          "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                        lineNumber: 174,
                        columnNumber: 13,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      Y,
                      {
                        className: "max-h-[400px]",
                        children: e.jsxDEV(
                          "div",
                          {
                            ref: b,
                            className: "p-2",
                            children: [
                              !m.trim() &&
                                t.length > 0 &&
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "mb-4",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-center gap-2 px-2 py-1 text-xs text-zinc-500 uppercase",
                                          children: [
                                            e.jsxDEV(
                                              U,
                                              { className: "w-3 h-3" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                                lineNumber: 198,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                            "Recent",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                          lineNumber: 197,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                                      t.map((n, s) =>
                                        e.jsxDEV(
                                          k,
                                          {
                                            command: n,
                                            index: s,
                                            isSelected: c === s,
                                            onSelect: p,
                                            icon: f(n),
                                          },
                                          `recent-${n.id}`,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                            lineNumber: 202,
                                            columnNumber: 23,
                                          },
                                          this,
                                        ),
                                      ),
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                    lineNumber: 196,
                                    columnNumber: 19,
                                  },
                                  this,
                                ),
                              m.trim()
                                ? h.length > 0
                                  ? e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "flex items-center gap-2 px-2 py-1 text-xs text-zinc-500 uppercase",
                                              children: [
                                                e.jsxDEV(
                                                  C,
                                                  { className: "w-3 h-3" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                                    lineNumber: 218,
                                                    columnNumber: 25,
                                                  },
                                                  this,
                                                ),
                                                "Results",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                              lineNumber: 217,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          h.map((n, s) =>
                                            e.jsxDEV(
                                              k,
                                              {
                                                command: n,
                                                index: s,
                                                isSelected: c === s,
                                                onSelect: p,
                                                icon: f(n),
                                              },
                                              n.id,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                                lineNumber: 222,
                                                columnNumber: 25,
                                              },
                                              this,
                                            ),
                                          ),
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                        lineNumber: 216,
                                        columnNumber: 21,
                                      },
                                      this,
                                    )
                                  : e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "py-12 text-center text-zinc-500",
                                        children: [
                                          e.jsxDEV(
                                            C,
                                            {
                                              className:
                                                "w-12 h-12 mx-auto mb-3 opacity-50",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                              lineNumber: 234,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              children: [
                                                'No commands found for "',
                                                m,
                                                '"',
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                              lineNumber: 235,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className: "text-xs mt-1",
                                              children:
                                                "Try a different search term",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                              lineNumber: 236,
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
                                          "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                        lineNumber: 233,
                                        columnNumber: 21,
                                      },
                                      this,
                                    )
                                : D && !t.length
                                  ? Object.entries(D).map(([n, s]) =>
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: "mb-4",
                                          children: [
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex items-center gap-2 px-2 py-1 text-xs text-zinc-500 uppercase",
                                                children: A(n),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                                lineNumber: 242,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                            s.map((l) => {
                                              const j = i.findIndex(
                                                (O) => O.id === l.id,
                                              );
                                              return e.jsxDEV(
                                                k,
                                                {
                                                  command: l,
                                                  index: j,
                                                  isSelected: c === j,
                                                  onSelect: p,
                                                  icon: f(l),
                                                },
                                                l.id,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                                  lineNumber: 248,
                                                  columnNumber: 27,
                                                },
                                                this,
                                              );
                                            }),
                                          ],
                                        },
                                        n,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                          lineNumber: 241,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                                    )
                                  : null,
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                            lineNumber: 194,
                            columnNumber: 15,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                        lineNumber: 193,
                        columnNumber: 13,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className:
                          "flex items-center justify-between p-3 border-t border-zinc-800 text-xs text-zinc-500",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center gap-4",
                              children: [
                                e.jsxDEV(
                                  "span",
                                  {
                                    className: "flex items-center gap-1",
                                    children: [
                                      e.jsxDEV(
                                        "kbd",
                                        {
                                          className:
                                            "px-1.5 py-0.5 bg-zinc-800 rounded",
                                          children: "↑",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                          lineNumber: 267,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "kbd",
                                        {
                                          className:
                                            "px-1.5 py-0.5 bg-zinc-800 rounded",
                                          children: "↓",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                          lineNumber: 268,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      "Navigate",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                    lineNumber: 266,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "span",
                                  {
                                    className: "flex items-center gap-1",
                                    children: [
                                      e.jsxDEV(
                                        "kbd",
                                        {
                                          className:
                                            "px-1.5 py-0.5 bg-zinc-800 rounded",
                                          children: "↵",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                          lineNumber: 272,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      "Select",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                    lineNumber: 271,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "span",
                                  {
                                    className: "flex items-center gap-1",
                                    children: [
                                      e.jsxDEV(
                                        "kbd",
                                        {
                                          className:
                                            "px-1.5 py-0.5 bg-zinc-800 rounded",
                                          children: "Esc",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                          lineNumber: 276,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      "Close",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                    lineNumber: 275,
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
                                "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                              lineNumber: 265,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center gap-1",
                              children: [
                                e.jsxDEV(
                                  "kbd",
                                  {
                                    className:
                                      "px-1.5 py-0.5 bg-zinc-800 rounded",
                                    children: M.mod,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                    lineNumber: 281,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "kbd",
                                  {
                                    className:
                                      "px-1.5 py-0.5 bg-zinc-800 rounded",
                                    children: "K",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                                    lineNumber: 282,
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
                                "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                              lineNumber: 280,
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
                          "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                        lineNumber: 264,
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
                    "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                  lineNumber: 160,
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
              "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
            lineNumber: 150,
            columnNumber: 9,
          },
          this,
        ),
    },
    void 0,
    !1,
    {
      fileName:
        "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
      lineNumber: 148,
      columnNumber: 5,
    },
    this,
  );
}
function k({ command: r, index: d, isSelected: a, onSelect: u, icon: N }) {
  return e.jsxDEV(
    "button",
    {
      "data-index": d,
      onClick: () => u(r),
      className: v(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
        a
          ? "bg-amber-600/20 text-amber-400"
          : "hover:bg-zinc-800/50 text-zinc-300",
      ),
      children: [
        e.jsxDEV(
          N,
          {
            className: v(
              "w-4 h-4 flex-shrink-0",
              a ? "text-amber-400" : "text-zinc-400",
            ),
          },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
            lineNumber: 310,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          "div",
          {
            className: "flex-1 min-w-0",
            children: [
              e.jsxDEV(
                "p",
                { className: "truncate font-medium", children: r.name },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                  lineNumber: 312,
                  columnNumber: 9,
                },
                this,
              ),
              r.description &&
                e.jsxDEV(
                  "p",
                  {
                    className: "text-xs text-zinc-500 truncate",
                    children: r.description,
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                    lineNumber: 314,
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
              "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
            lineNumber: 311,
            columnNumber: 7,
          },
          this,
        ),
        r.shortcut &&
          e.jsxDEV(
            "div",
            {
              className: "flex items-center gap-1 flex-shrink-0",
              children: [
                r.shortcut.modifiers?.map((t) =>
                  e.jsxDEV(
                    "kbd",
                    {
                      className:
                        "px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs",
                      children:
                        t === "cmd"
                          ? w().mod
                          : t === "shift"
                            ? "⇧"
                            : t === "alt"
                              ? w().alt
                              : t,
                    },
                    t,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                      lineNumber: 320,
                      columnNumber: 13,
                    },
                    this,
                  ),
                ),
                e.jsxDEV(
                  "kbd",
                  {
                    className:
                      "px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs",
                    children: r.shortcut.key.toUpperCase(),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
                    lineNumber: 324,
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
                "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
              lineNumber: 318,
              columnNumber: 9,
            },
            this,
          ),
        a &&
          e.jsxDEV(
            y,
            { className: "w-4 h-4 text-amber-400 flex-shrink-0" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
              lineNumber: 329,
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
        "/home/runner/workspace/client/src/components/commands/CommandPalette.tsx",
      lineNumber: 302,
      columnNumber: 5,
    },
    this,
  );
}
export { re as CommandPalette, re as default };
