import {
  r as m,
  ag as M,
  aH as A,
  aI as N,
  f as e,
  cy as Q,
  ap as x,
  dR as S,
  bu as q,
  bv as F,
  dK as L,
  c_ as R,
  dr as K,
  dc as P,
  cU as B,
  d4 as U,
  dS as z,
  dT as I,
  cc as $,
  du as H,
  dj as Y,
  bc as O,
  cf as G,
  cv as J,
  dP as W,
} from "./vendor-react-31oK5L0i.js";
import {
  u as X,
  j as d,
  a4 as Z,
  a5 as ee,
  a6 as b,
  B as y,
  C as ie,
  h as se,
  q as a,
  a as f,
} from "./studio-DOUfHW5v.js";
import { a as te } from "./index-D5xLbTBZ.js";
import { t as w, c as g, N as ae } from "./TopBar-jcH3P98k.js";
import { A as ne } from "./AppLayout-D2pri0rw.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
const re = {
  account_security: J,
  distribution: G,
  social_media: O,
  direct_interaction: Y,
  platform_generated: H,
  content_based: $,
  engagement_summary: I,
  location_based: z,
  marketplace: U,
  royalties: B,
  collaboration: P,
  achievements: K,
  system: R,
  platform_admin: L,
};
function he() {
  const [n, k] = m.useState("all"),
    { toast: o } = X(),
    { user: E } = te(),
    [, u] = M(),
    { data: r = [], isLoading: D } = A({
      queryKey: ["/api/notifications"],
      enabled: !!E,
    }),
    l = m.useMemo(() => r.filter((i) => !i.isRead).length, [r]),
    v = m.useMemo(
      () =>
        r.filter((i) =>
          n === "all"
            ? !0
            : n === "unread"
              ? !i.isRead
              : (i.category || w[i.type] || "system") === n,
        ),
      [r, n],
    ),
    j = m.useMemo(() => {
      const i = {
        account_security: [],
        distribution: [],
        social_media: [],
        direct_interaction: [],
        platform_generated: [],
        content_based: [],
        engagement_summary: [],
        location_based: [],
        marketplace: [],
        royalties: [],
        collaboration: [],
        achievements: [],
        system: [],
        platform_admin: [],
      };
      return (
        r.forEach((s) => {
          const t = s.category || w[s.type] || "system";
          i[t] ? i[t].push(s) : i.system.push(s);
        }),
        i
      );
    }, [r]),
    V = N({
      mutationFn: async (i) => f("PUT", `/api/notifications/${i}/read`),
      onMutate: async (i) => {
        await a.cancelQueries({ queryKey: ["/api/notifications"] });
        const s = a.getQueryData(["/api/notifications"]);
        return (
          a.setQueryData(["/api/notifications"], (t = []) =>
            t.map((c) => (c.id === i ? { ...c, isRead: !0 } : c)),
          ),
          { previous: s }
        );
      },
      onError: (i, s, t) => {
        (a.setQueryData(["/api/notifications"], t?.previous),
          o({
            title: "Error",
            description: "Failed to mark as read",
            variant: "destructive",
          }));
      },
      onSettled: () =>
        a.invalidateQueries({ queryKey: ["/api/notifications"] }),
    }),
    p = N({
      mutationFn: async () => f("PUT", "/api/notifications/mark-all-read"),
      onSuccess: () => {
        (a.invalidateQueries({ queryKey: ["/api/notifications"] }),
          o({ title: "All notifications marked as read" }));
      },
      onError: () =>
        o({
          title: "Error",
          description: "Failed to mark all as read",
          variant: "destructive",
        }),
    }),
    C = N({
      mutationFn: async (i) => f("DELETE", `/api/notifications/${i}`),
      onMutate: async (i) => {
        await a.cancelQueries({ queryKey: ["/api/notifications"] });
        const s = a.getQueryData(["/api/notifications"]);
        return (
          a.setQueryData(["/api/notifications"], (t = []) =>
            t.filter((c) => c.id !== i),
          ),
          { previous: s }
        );
      },
      onSuccess: () => o({ title: "Notification deleted" }),
      onError: (i, s, t) => {
        (a.setQueryData(["/api/notifications"], t?.previous),
          o({
            title: "Error",
            description: "Failed to delete notification",
            variant: "destructive",
          }));
      },
      onSettled: () =>
        a.invalidateQueries({ queryKey: ["/api/notifications"] }),
    }),
    h = N({
      mutationFn: async () => f("DELETE", "/api/notifications/clear-all"),
      onSuccess: () => {
        (a.invalidateQueries({ queryKey: ["/api/notifications"] }),
          o({ title: "All notifications cleared" }));
      },
      onError: () =>
        o({
          title: "Error",
          description: "Failed to clear notifications",
          variant: "destructive",
        }),
    }),
    _ = m.useCallback(
      (i) => {
        u(i);
      },
      [u],
    );
  return e.jsxDEV(
    ne,
    {
      title: "Notifications",
      children: e.jsxDEV(
        "div",
        {
          className: "max-w-3xl mx-auto",
          children: [
            e.jsxDEV(
              "div",
              {
                className: "flex items-center justify-between mb-6",
                children: [
                  e.jsxDEV(
                    "div",
                    {
                      className: "flex items-center gap-3",
                      children: [
                        e.jsxDEV(
                          d,
                          {
                            variant: "ghost",
                            size: "icon",
                            onClick: () => u("/dashboard"),
                            children: e.jsxDEV(
                              Q,
                              { className: "h-5 w-5" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                lineNumber: 174,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Notifications.tsx",
                            lineNumber: 173,
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
                                  className: "text-2xl font-bold",
                                  children: "Notifications",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                  lineNumber: 177,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              l > 0 &&
                                e.jsxDEV(
                                  "p",
                                  {
                                    className: "text-sm text-muted-foreground",
                                    children: [l, " unread"],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                    lineNumber: 179,
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
                              "/home/runner/workspace/client/src/pages/Notifications.tsx",
                            lineNumber: 176,
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
                        "/home/runner/workspace/client/src/pages/Notifications.tsx",
                      lineNumber: 172,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          d,
                          {
                            variant: "outline",
                            size: "sm",
                            onClick: () => p.mutate(),
                            disabled: l === 0 || p.isPending,
                            children: [
                              p.isPending
                                ? e.jsxDEV(
                                    x,
                                    { className: "h-4 w-4 animate-spin mr-2" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                      lineNumber: 191,
                                      columnNumber: 17,
                                    },
                                    this,
                                  )
                                : e.jsxDEV(
                                    S,
                                    { className: "h-4 w-4 mr-2" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                      lineNumber: 193,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                              "Mark all read",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Notifications.tsx",
                            lineNumber: 184,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          d,
                          {
                            variant: "outline",
                            size: "sm",
                            onClick: () => h.mutate(),
                            disabled: r.length === 0 || h.isPending,
                            children: [
                              h.isPending
                                ? e.jsxDEV(
                                    x,
                                    { className: "h-4 w-4 animate-spin mr-2" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                      lineNumber: 204,
                                      columnNumber: 17,
                                    },
                                    this,
                                  )
                                : e.jsxDEV(
                                    q,
                                    { className: "h-4 w-4 mr-2" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                      lineNumber: 206,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                              "Clear all",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Notifications.tsx",
                            lineNumber: 197,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          d,
                          {
                            variant: "ghost",
                            size: "icon",
                            onClick: () => u("/settings?tab=notifications"),
                            title: "Notification settings",
                            children: e.jsxDEV(
                              F,
                              { className: "h-4 w-4" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                lineNumber: 216,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Notifications.tsx",
                            lineNumber: 210,
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
                        "/home/runner/workspace/client/src/pages/Notifications.tsx",
                      lineNumber: 183,
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
                  "/home/runner/workspace/client/src/pages/Notifications.tsx",
                lineNumber: 171,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              Z,
              {
                value: n,
                onValueChange: (i) => k(i),
                className: "mb-4",
                children: e.jsxDEV(
                  ee,
                  {
                    className:
                      "w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0",
                    children: [
                      e.jsxDEV(
                        b,
                        {
                          value: "all",
                          className: "text-sm",
                          children: ["All (", r.length, ")"],
                        },
                        void 0,
                        !0,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Notifications.tsx",
                          lineNumber: 223,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        b,
                        {
                          value: "unread",
                          className: "text-sm",
                          children: [
                            "Unread",
                            l > 0 &&
                              e.jsxDEV(
                                y,
                                {
                                  variant: "secondary",
                                  className: "ml-1 h-5 px-1.5 text-xs",
                                  children: l,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Notifications.tsx",
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
                            "/home/runner/workspace/client/src/pages/Notifications.tsx",
                          lineNumber: 226,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      Object.keys(g).map((i) => {
                        const s = re[i],
                          t = j[i].filter((T) => !T.isRead).length,
                          c = g[i]?.label || i;
                        return e.jsxDEV(
                          b,
                          {
                            value: i,
                            className: "text-sm",
                            children: [
                              e.jsxDEV(
                                s,
                                { className: "h-3.5 w-3.5 mr-1.5" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                  lineNumber: 240,
                                  columnNumber: 19,
                                },
                                this,
                              ),
                              c,
                              t > 0 &&
                                e.jsxDEV(
                                  y,
                                  {
                                    variant: "secondary",
                                    className: "ml-1 h-5 px-1.5 text-xs",
                                    children: t,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                    lineNumber: 243,
                                    columnNumber: 21,
                                  },
                                  this,
                                ),
                            ],
                          },
                          i,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Notifications.tsx",
                            lineNumber: 239,
                            columnNumber: 17,
                          },
                          this,
                        );
                      }),
                    ],
                  },
                  void 0,
                  !0,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Notifications.tsx",
                    lineNumber: 222,
                    columnNumber: 11,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Notifications.tsx",
                lineNumber: 221,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              ie,
              {
                children: e.jsxDEV(
                  se,
                  {
                    className: "p-0",
                    children: D
                      ? e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center justify-center p-16",
                            children: e.jsxDEV(
                              x,
                              {
                                className:
                                  "h-8 w-8 animate-spin text-muted-foreground",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Notifications.tsx",
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
                              "/home/runner/workspace/client/src/pages/Notifications.tsx",
                            lineNumber: 256,
                            columnNumber: 15,
                          },
                          this,
                        )
                      : v.length === 0
                        ? e.jsxDEV(
                            "div",
                            {
                              className:
                                "flex flex-col items-center justify-center p-16 text-center",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "rounded-full bg-muted p-6 mb-4",
                                    children: e.jsxDEV(
                                      W,
                                      {
                                        className:
                                          "h-10 w-10 text-muted-foreground",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                        lineNumber: 262,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                    lineNumber: 261,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "h3",
                                  {
                                    className: "font-semibold text-lg mb-2",
                                    children: "No notifications",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                    lineNumber: 264,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "p",
                                  {
                                    className:
                                      "text-sm text-muted-foreground max-w-[280px]",
                                    children:
                                      n === "unread"
                                        ? "You're all caught up! No unread notifications."
                                        : n === "all"
                                          ? "You don't have any notifications yet. They'll appear here when something happens."
                                          : `No ${g[n]?.label.toLowerCase() || n} notifications.`,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                    lineNumber: 265,
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
                                "/home/runner/workspace/client/src/pages/Notifications.tsx",
                              lineNumber: 260,
                              columnNumber: 15,
                            },
                            this,
                          )
                        : e.jsxDEV(
                            "div",
                            {
                              className: "divide-y",
                              children: v.map((i) =>
                                e.jsxDEV(
                                  ae,
                                  {
                                    notification: i,
                                    onMarkAsRead: (s) => V.mutate(s),
                                    onDelete: (s) => C.mutate(s),
                                    onNavigate: _,
                                  },
                                  i.id,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Notifications.tsx",
                                    lineNumber: 276,
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
                                "/home/runner/workspace/client/src/pages/Notifications.tsx",
                              lineNumber: 274,
                              columnNumber: 15,
                            },
                            this,
                          ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Notifications.tsx",
                    lineNumber: 254,
                    columnNumber: 11,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Notifications.tsx",
                lineNumber: 253,
                columnNumber: 9,
              },
              this,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Notifications.tsx",
          lineNumber: 170,
          columnNumber: 7,
        },
        this,
      ),
    },
    void 0,
    !1,
    {
      fileName: "/home/runner/workspace/client/src/pages/Notifications.tsx",
      lineNumber: 169,
      columnNumber: 5,
    },
    this,
  );
}
export { he as default };
