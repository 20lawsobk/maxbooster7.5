import {
  ah as be,
  ag as fe,
  r as m,
  aH as I,
  aI as F,
  f as e,
  dE as ae,
  c6 as ge,
  fQ as ve,
  ai as k,
  dk as H,
  cU as Se,
  dc as ke,
  c$ as De,
  N as Ee,
  dS as je,
  a_ as Ve,
  b3 as ye,
  dq as Ce,
  ca as Te,
  d7 as Me,
  bu as L,
  aO as Ue,
} from "./vendor-react-31oK5L0i.js";
import { A as Ae } from "./AppLayout-D2pri0rw.js";
import {
  u as Fe,
  j as i,
  o as B,
  ae as le,
  p as Y,
  r as W,
  v as _,
  w as G,
  L as t,
  I as l,
  ac as J,
  C as h,
  d as D,
  f as E,
  h as j,
  a4 as Le,
  a5 as qe,
  a6 as X,
  a9 as Z,
  g as te,
  B as Oe,
  i as Pe,
  a0 as ze,
  a1 as Ke,
  a2 as $e,
  a3 as oe,
  a7 as Re,
  H as Qe,
  K as Ie,
  M as He,
  N as Be,
  O as Ye,
  Q as We,
  R as _e,
  U as Ge,
  a as V,
} from "./studio-DOUfHW5v.js";
import { a as Je } from "./useRequireAuth-K5x5riUd.js";
import {
  a$ as Xe,
  b0 as q,
  af as b,
  aU as Ze,
  ai as es,
  aJ as ss,
  aq as rs,
  aK as is,
  ar as ns,
  b1 as as,
  aA as ce,
  aB as ls,
} from "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./TopBar-jcH3P98k.js";
import "./index-D5xLbTBZ.js";
import "./vendor-animation-CFQslDag.js";
function ws() {
  Je();
  const { toast: N } = Fe(),
    d = be(),
    [, me] = fe(),
    [ue, y] = m.useState(!1),
    [he, C] = m.useState(!1),
    [T, ee] = m.useState("list"),
    [O, M] = m.useState(null),
    [n, c] = m.useState(null),
    [a, p] = m.useState({
      name: "",
      venue: "",
      city: "",
      country: "US",
      date: "",
      capacity: 0,
      ticketUrl: "",
      notes: "",
    }),
    [f, g] = m.useState({ name: "", tracks: [] }),
    [x, v] = m.useState({ title: "", duration: "", notes: "" }),
    [w, P] = m.useState(new Date()),
    { data: z, isLoading: Ne } = I({ queryKey: ["/api/shows"] }),
    { data: se } = I({ queryKey: ["/api/shows/stats"] }),
    K = F({
      mutationFn: async (s) => (await V("POST", "/api/shows", s)).json(),
      onSuccess: () => {
        (d.invalidateQueries({ queryKey: ["/api/shows"] }),
          d.invalidateQueries({ queryKey: ["/api/shows/stats"] }),
          y(!1),
          p({
            name: "",
            venue: "",
            city: "",
            country: "US",
            date: "",
            capacity: 0,
            ticketUrl: "",
            notes: "",
          }),
          N({
            title: "Show created",
            description: "Your performance has been scheduled.",
          }));
      },
    }),
    de = F({
      mutationFn: async (s) => {
        await V("DELETE", `/api/shows/${s}`);
      },
      onSuccess: () => {
        (d.invalidateQueries({ queryKey: ["/api/shows"] }),
          d.invalidateQueries({ queryKey: ["/api/shows/stats"] }),
          N({
            title: "Show deleted",
            description: "The show has been removed from your calendar.",
          }));
      },
    }),
    { data: U = [] } = I({ queryKey: ["/api/shows/setlists"] }),
    $ = F({
      mutationFn: async (s) =>
        (await V("POST", "/api/shows/setlists", s)).json(),
      onSuccess: () => {
        (d.invalidateQueries({ queryKey: ["/api/shows/setlists"] }),
          C(!1),
          g({ name: "", tracks: [] }),
          v({ title: "", duration: "", notes: "" }),
          N({
            title: "Setlist created",
            description: "Your setlist is ready for performance.",
          }));
      },
      onError: () => {
        N({
          title: "Error",
          description: "Failed to create setlist.",
          variant: "destructive",
        });
      },
    }),
    pe = F({
      mutationFn: async (s) => {
        await V("DELETE", `/api/shows/setlists/${s}`);
      },
      onSuccess: () => {
        (d.invalidateQueries({ queryKey: ["/api/shows/setlists"] }),
          N({ title: "Setlist deleted" }));
      },
    }),
    R = z?.filter((s) => Xe(new Date(s.date))) || [],
    re = z?.filter((s) => q(new Date(s.date))) || [];
  return e.jsxDEV(
    Ae,
    {
      title: "Shows & Tour Management",
      children: e.jsxDEV(
        "div",
        {
          className: "space-y-6",
          children: [
            e.jsxDEV(
              "div",
              {
                className:
                  "flex flex-col md:flex-row md:items-center justify-between gap-4",
                children: [
                  e.jsxDEV(
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
                                ae,
                                { className: "h-8 w-8 text-primary" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 177,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              "Shows & Tour",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 176,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-muted-foreground mt-1",
                            children:
                              "Manage your live performances, ticket sales, and setlists.",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 180,
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
                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                      lineNumber: 175,
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
                          "div",
                          {
                            className: "flex bg-muted p-1 rounded-lg",
                            children: [
                              e.jsxDEV(
                                i,
                                {
                                  variant: T === "list" ? "secondary" : "ghost",
                                  size: "sm",
                                  onClick: () => ee("list"),
                                  children: [
                                    e.jsxDEV(
                                      ge,
                                      { className: "h-4 w-4 mr-2" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 191,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    "List",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 186,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                i,
                                {
                                  variant:
                                    T === "calendar" ? "secondary" : "ghost",
                                  size: "sm",
                                  onClick: () => ee("calendar"),
                                  children: [
                                    e.jsxDEV(
                                      ve,
                                      { className: "h-4 w-4 mr-2" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 199,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    "Calendar",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 194,
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
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 185,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          B,
                          {
                            open: ue,
                            onOpenChange: y,
                            children: [
                              e.jsxDEV(
                                le,
                                {
                                  asChild: !0,
                                  children: e.jsxDEV(
                                    i,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          k,
                                          { className: "h-4 w-4 mr-2" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                            lineNumber: 206,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        "Add Show",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                                      lineNumber: 205,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 204,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                Y,
                                {
                                  className: "max-w-md",
                                  children: [
                                    e.jsxDEV(
                                      W,
                                      {
                                        children: [
                                          e.jsxDEV(
                                            _,
                                            { children: "Add New Show" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 212,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            G,
                                            {
                                              children:
                                                "Enter the details for your upcoming performance.",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 213,
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
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 211,
                                        columnNumber: 17,
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
                                              className: "space-y-2",
                                              children: [
                                                e.jsxDEV(
                                                  t,
                                                  {
                                                    htmlFor: "name",
                                                    children:
                                                      "Show Name / Tour Stop",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 217,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  l,
                                                  {
                                                    id: "name",
                                                    placeholder:
                                                      "e.g. Summer Festival 2024",
                                                    value: a.name,
                                                    onChange: (s) =>
                                                      p({
                                                        ...a,
                                                        name: s.target.value,
                                                      }),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 218,
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
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 216,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "grid grid-cols-2 gap-4",
                                              children: [
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "space-y-2",
                                                    children: [
                                                      e.jsxDEV(
                                                        t,
                                                        {
                                                          htmlFor: "venue",
                                                          children: "Venue",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                          lineNumber: 227,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        l,
                                                        {
                                                          id: "venue",
                                                          placeholder:
                                                            "Club Name",
                                                          value: a.venue,
                                                          onChange: (s) =>
                                                            p({
                                                              ...a,
                                                              venue:
                                                                s.target.value,
                                                            }),
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                          lineNumber: 228,
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
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 226,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "space-y-2",
                                                    children: [
                                                      e.jsxDEV(
                                                        t,
                                                        {
                                                          htmlFor: "city",
                                                          children: "City",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                          lineNumber: 236,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        l,
                                                        {
                                                          id: "city",
                                                          placeholder: "City",
                                                          value: a.city,
                                                          onChange: (s) =>
                                                            p({
                                                              ...a,
                                                              city: s.target
                                                                .value,
                                                            }),
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                          lineNumber: 237,
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
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 235,
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
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 225,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "grid grid-cols-2 gap-4",
                                              children: [
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "space-y-2",
                                                    children: [
                                                      e.jsxDEV(
                                                        t,
                                                        {
                                                          htmlFor: "date",
                                                          children:
                                                            "Date & Time",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                          lineNumber: 247,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        l,
                                                        {
                                                          id: "date",
                                                          type: "datetime-local",
                                                          value: a.date,
                                                          onChange: (s) =>
                                                            p({
                                                              ...a,
                                                              date: s.target
                                                                .value,
                                                            }),
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                          lineNumber: 248,
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
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 246,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "space-y-2",
                                                    children: [
                                                      e.jsxDEV(
                                                        t,
                                                        {
                                                          htmlFor: "capacity",
                                                          children: "Capacity",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                          lineNumber: 256,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        l,
                                                        {
                                                          id: "capacity",
                                                          type: "number",
                                                          value: a.capacity,
                                                          onChange: (s) =>
                                                            p({
                                                              ...a,
                                                              capacity:
                                                                parseInt(
                                                                  s.target
                                                                    .value,
                                                                ) || 0,
                                                            }),
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                          lineNumber: 257,
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
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 255,
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
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 245,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className: "space-y-2",
                                              children: [
                                                e.jsxDEV(
                                                  t,
                                                  {
                                                    htmlFor: "ticketUrl",
                                                    children: "Ticket URL",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 266,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  l,
                                                  {
                                                    id: "ticketUrl",
                                                    placeholder: "https://...",
                                                    value: a.ticketUrl,
                                                    onChange: (s) =>
                                                      p({
                                                        ...a,
                                                        ticketUrl:
                                                          s.target.value,
                                                      }),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 267,
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
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 265,
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
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 215,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      J,
                                      {
                                        children: [
                                          e.jsxDEV(
                                            i,
                                            {
                                              variant: "outline",
                                              onClick: () => y(!1),
                                              children: "Cancel",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 276,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            i,
                                            {
                                              onClick: () => K.mutate(a),
                                              disabled:
                                                !a.name ||
                                                !a.date ||
                                                K.isPending,
                                              children: K.isPending
                                                ? "Adding..."
                                                : "Add Show",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
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
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
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
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 210,
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
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 203,
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
                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                      lineNumber: 184,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Shows.tsx",
                lineNumber: 174,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                className: "grid grid-cols-1 md:grid-cols-3 gap-4",
                children: [
                  e.jsxDEV(
                    h,
                    {
                      children: [
                        e.jsxDEV(
                          D,
                          {
                            className:
                              "flex flex-row items-center justify-between pb-2",
                            children: [
                              e.jsxDEV(
                                E,
                                {
                                  className:
                                    "text-sm font-medium text-muted-foreground",
                                  children: "Upcoming Shows",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 292,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                H,
                                { className: "h-4 w-4 text-primary" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 293,
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
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 291,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          j,
                          {
                            children: e.jsxDEV(
                              "div",
                              {
                                className: "text-2xl font-bold",
                                children: R.length,
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                lineNumber: 296,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 295,
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
                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                      lineNumber: 290,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    h,
                    {
                      children: [
                        e.jsxDEV(
                          D,
                          {
                            className:
                              "flex flex-row items-center justify-between pb-2",
                            children: [
                              e.jsxDEV(
                                E,
                                {
                                  className:
                                    "text-sm font-medium text-muted-foreground",
                                  children: "Total Revenue",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 301,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                Se,
                                { className: "h-4 w-4 text-green-500" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 302,
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
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 300,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          j,
                          {
                            children: e.jsxDEV(
                              "div",
                              {
                                className: "text-2xl font-bold",
                                children: [
                                  "$",
                                  se?.totalRevenue?.toLocaleString() || "0",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                lineNumber: 305,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 304,
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
                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                      lineNumber: 299,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    h,
                    {
                      children: [
                        e.jsxDEV(
                          D,
                          {
                            className:
                              "flex flex-row items-center justify-between pb-2",
                            children: [
                              e.jsxDEV(
                                E,
                                {
                                  className:
                                    "text-sm font-medium text-muted-foreground",
                                  children: "Avg. Attendance",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 310,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                ke,
                                { className: "h-4 w-4 text-blue-500" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 311,
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
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 309,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          j,
                          {
                            children: e.jsxDEV(
                              "div",
                              {
                                className: "text-2xl font-bold",
                                children: Math.round(se?.avgTicketsSold || 0),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                lineNumber: 314,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 313,
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
                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                      lineNumber: 308,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Shows.tsx",
                lineNumber: 289,
                columnNumber: 9,
              },
              this,
            ),
            T === "calendar" &&
              e.jsxDEV(
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
                            "h2",
                            {
                              className: "text-lg font-semibold",
                              children: b(w, "MMMM yyyy"),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                              lineNumber: 323,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center gap-2",
                              children: [
                                e.jsxDEV(
                                  i,
                                  {
                                    variant: "outline",
                                    size: "icon",
                                    className: "h-8 w-8",
                                    onClick: () => P(Ze(w, 1)),
                                    children: e.jsxDEV(
                                      De,
                                      { className: "h-4 w-4" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 326,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                    lineNumber: 325,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  i,
                                  {
                                    variant: "outline",
                                    size: "sm",
                                    className: "h-8",
                                    onClick: () => P(new Date()),
                                    children: "Today",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                    lineNumber: 328,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  i,
                                  {
                                    variant: "outline",
                                    size: "icon",
                                    className: "h-8 w-8",
                                    onClick: () => P(es(w, 1)),
                                    children: e.jsxDEV(
                                      Ee,
                                      { className: "h-4 w-4" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
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
                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                    lineNumber: 331,
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
                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                              lineNumber: 324,
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
                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                        lineNumber: 322,
                        columnNumber: 13,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className: "overflow-x-auto",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              className:
                                "grid grid-cols-7 border border-b-0 rounded-t-lg overflow-hidden min-w-[480px]",
                              children: [
                                "Mon",
                                "Tue",
                                "Wed",
                                "Thu",
                                "Fri",
                                "Sat",
                                "Sun",
                              ].map((s) =>
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "px-2 py-2 text-xs font-semibold text-muted-foreground bg-muted/30 text-center border-r last:border-r-0",
                                    children: s,
                                  },
                                  s,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                    lineNumber: 341,
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
                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                              lineNumber: 339,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          (() => {
                            const s = ss(w),
                              r = rs(w),
                              u = is(s, { weekStartsOn: 1 }),
                              S = ns(r, { weekStartsOn: 1 }),
                              Q = as({ start: u, end: S });
                            return e.jsxDEV(
                              "div",
                              {
                                className:
                                  "grid grid-cols-7 border rounded-b-lg overflow-hidden min-w-[480px]",
                                children: Q.map((A, ie) => {
                                  const xe =
                                      z?.filter((o) =>
                                        ce(new Date(o.date), A),
                                      ) || [],
                                    ne = ce(A, new Date()),
                                    we = ls(A, w);
                                  return e.jsxDEV(
                                    "div",
                                    {
                                      className: [
                                        "min-h-[90px] p-1.5 border-r border-b last:border-r-0 text-xs",
                                        we ? "" : "bg-muted/20 opacity-50",
                                        ne
                                          ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                                          : "",
                                        (ie + 1) % 7 === 0 ? "border-r-0" : "",
                                      ].join(" "),
                                      children: [
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: [
                                              "font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full text-xs",
                                              ne
                                                ? "bg-primary text-primary-foreground"
                                                : "text-muted-foreground",
                                            ].join(" "),
                                            children: b(A, "d"),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                            lineNumber: 371,
                                            columnNumber: 25,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "space-y-0.5",
                                            children: xe.map((o) =>
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "rounded px-1.5 py-0.5 text-[10px] leading-tight font-medium truncate cursor-pointer hover:opacity-80",
                                                  style: {
                                                    background: q(
                                                      new Date(o.date),
                                                    )
                                                      ? "#374151"
                                                      : "#3b82f615",
                                                    color: q(new Date(o.date))
                                                      ? "#9ca3af"
                                                      : "#3b82f6",
                                                    border: `1px solid ${q(new Date(o.date)) ? "#374151" : "#3b82f630"}`,
                                                  },
                                                  title: `${o.name} @ ${o.venue}`,
                                                  onClick: () => c(o),
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: "truncate",
                                                        children: o.name,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 386,
                                                        columnNumber: 31,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "truncate text-muted-foreground",
                                                        children: b(
                                                          new Date(o.date),
                                                          "h:mm a",
                                                        ),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 387,
                                                        columnNumber: 31,
                                                      },
                                                      this,
                                                    ),
                                                  ],
                                                },
                                                o.id,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                  lineNumber: 379,
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
                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                            lineNumber: 377,
                                            columnNumber: 25,
                                          },
                                          this,
                                        ),
                                      ],
                                    },
                                    ie,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                                      lineNumber: 362,
                                      columnNumber: 23,
                                    },
                                    this,
                                  );
                                }),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                lineNumber: 356,
                                columnNumber: 17,
                              },
                              this,
                            );
                          })(),
                        ],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                        lineNumber: 338,
                        columnNumber: 13,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className:
                          "flex items-center gap-4 text-xs text-muted-foreground",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center gap-1.5",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "w-3 h-3 rounded-sm bg-blue-500/20 border border-blue-500/30",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                    lineNumber: 402,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                "Upcoming",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                              lineNumber: 401,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center gap-1.5",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "w-3 h-3 rounded-sm bg-[#374151] border border-[#374151]",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                    lineNumber: 406,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                "Past",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                              lineNumber: 405,
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
                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                        lineNumber: 400,
                        columnNumber: 13,
                      },
                      this,
                    ),
                  ],
                },
                void 0,
                !0,
                {
                  fileName: "/home/runner/workspace/client/src/pages/Shows.tsx",
                  lineNumber: 320,
                  columnNumber: 11,
                },
                this,
              ),
            e.jsxDEV(
              Le,
              {
                defaultValue: "upcoming",
                className: "space-y-4",
                style: { display: T === "calendar" ? "none" : void 0 },
                children: [
                  e.jsxDEV(
                    qe,
                    {
                      children: [
                        e.jsxDEV(
                          X,
                          { value: "upcoming", children: "Upcoming" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 415,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          X,
                          { value: "past", children: "Past Shows" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 416,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          X,
                          { value: "setlists", children: "Setlists" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 417,
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
                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                      lineNumber: 414,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    Z,
                    {
                      value: "upcoming",
                      children: Ne
                        ? e.jsxDEV(
                            "div",
                            {
                              className:
                                "flex items-center justify-center py-12",
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
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 423,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                              lineNumber: 422,
                              columnNumber: 15,
                            },
                            this,
                          )
                        : R.length === 0
                          ? e.jsxDEV(
                              h,
                              {
                                className: "p-12 text-center",
                                children: [
                                  e.jsxDEV(
                                    ae,
                                    {
                                      className:
                                        "h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                                      lineNumber: 427,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "h3",
                                    {
                                      className: "text-xl font-medium",
                                      children: "No upcoming shows",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                                      lineNumber: 428,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className:
                                        "text-muted-foreground mt-2 max-w-md mx-auto",
                                      children:
                                        "You haven't scheduled any upcoming shows yet. Time to hit the stage!",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                                      lineNumber: 429,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    i,
                                    {
                                      className: "mt-6",
                                      onClick: () => y(!0),
                                      children: [
                                        e.jsxDEV(
                                          k,
                                          { className: "h-4 w-4 mr-2" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                            lineNumber: 433,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        "Schedule First Show",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                                      lineNumber: 432,
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
                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                lineNumber: 426,
                                columnNumber: 15,
                              },
                              this,
                            )
                          : e.jsxDEV(
                              "div",
                              {
                                className:
                                  "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
                                children: R.map((s) =>
                                  e.jsxDEV(
                                    h,
                                    {
                                      className:
                                        "overflow-hidden border-l-4 border-l-primary",
                                      children: [
                                        e.jsxDEV(
                                          D,
                                          {
                                            children: e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex justify-between items-start",
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      children: [
                                                        e.jsxDEV(
                                                          E,
                                                          {
                                                            className:
                                                              "text-xl",
                                                            children: s.name,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                            lineNumber: 444,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          te,
                                                          {
                                                            className:
                                                              "flex items-center gap-1 mt-1",
                                                            children: [
                                                              e.jsxDEV(
                                                                je,
                                                                {
                                                                  className:
                                                                    "h-3 w-3",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                  lineNumber: 446,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              s.venue,
                                                              ", ",
                                                              s.city,
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                            lineNumber: 445,
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
                                                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                      lineNumber: 443,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    Oe,
                                                    {
                                                      variant: "outline",
                                                      className: "bg-primary/5",
                                                      children: "Upcoming",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                      lineNumber: 450,
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
                                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                lineNumber: 442,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                            lineNumber: 441,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          j,
                                          {
                                            className: "space-y-3",
                                            children: [
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "flex items-center gap-4 text-sm",
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center gap-1.5 text-muted-foreground",
                                                        children: [
                                                          e.jsxDEV(
                                                            H,
                                                            {
                                                              className:
                                                                "h-4 w-4",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                              lineNumber: 456,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          b(
                                                            new Date(s.date),
                                                            "MMM d, yyyy",
                                                          ),
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 455,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center gap-1.5 text-muted-foreground",
                                                        children: [
                                                          e.jsxDEV(
                                                            Ve,
                                                            {
                                                              className:
                                                                "h-4 w-4",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                              lineNumber: 460,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          b(
                                                            new Date(s.date),
                                                            "h:mm a",
                                                          ),
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 459,
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
                                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                  lineNumber: 454,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              s.capacity &&
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "space-y-1.5",
                                                    children: [
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "flex justify-between text-xs",
                                                          children: [
                                                            e.jsxDEV(
                                                              "span",
                                                              {
                                                                className:
                                                                  "text-muted-foreground",
                                                                children:
                                                                  "Tickets Sold",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                lineNumber: 468,
                                                                columnNumber: 29,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              "span",
                                                              {
                                                                children: [
                                                                  s.ticketsSold,
                                                                  " / ",
                                                                  s.capacity,
                                                                ],
                                                              },
                                                              void 0,
                                                              !0,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                lineNumber: 469,
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
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                          lineNumber: 467,
                                                          columnNumber: 27,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "w-full bg-muted rounded-full h-1.5 overflow-hidden",
                                                          children: e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "bg-primary h-full transition-all",
                                                              style: {
                                                                width: `${Math.min(100, ((s.ticketsSold || 0) / s.capacity) * 100)}%`,
                                                              },
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                              lineNumber: 472,
                                                              columnNumber: 29,
                                                            },
                                                            this,
                                                          ),
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
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
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 466,
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
                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                            lineNumber: 453,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          Pe,
                                          {
                                            className: "bg-muted/30 flex gap-2",
                                            children: [
                                              e.jsxDEV(
                                                i,
                                                {
                                                  size: "sm",
                                                  className:
                                                    "flex-1 bg-red-600 hover:bg-red-700 text-white",
                                                  onClick: () =>
                                                    me(
                                                      `/show?id=${s.id}&name=${encodeURIComponent(s.name)}`,
                                                    ),
                                                  children: [
                                                    e.jsxDEV(
                                                      ye,
                                                      {
                                                        className:
                                                          "h-3.5 w-3.5 mr-1.5 animate-pulse",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 486,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    "Go Live",
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                  lineNumber: 481,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              s.ticketUrl &&
                                                e.jsxDEV(
                                                  i,
                                                  {
                                                    variant: "outline",
                                                    size: "sm",
                                                    asChild: !0,
                                                    children: e.jsxDEV(
                                                      "a",
                                                      {
                                                        href: s.ticketUrl,
                                                        target: "_blank",
                                                        rel: "noopener noreferrer",
                                                        children: e.jsxDEV(
                                                          Ce,
                                                          {
                                                            className:
                                                              "h-3.5 w-3.5",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                            lineNumber: 492,
                                                            columnNumber: 29,
                                                          },
                                                          this,
                                                        ),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 491,
                                                        columnNumber: 27,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 490,
                                                    columnNumber: 25,
                                                  },
                                                  this,
                                                ),
                                              e.jsxDEV(
                                                ze,
                                                {
                                                  children: [
                                                    e.jsxDEV(
                                                      Ke,
                                                      {
                                                        asChild: !0,
                                                        children: e.jsxDEV(
                                                          i,
                                                          {
                                                            variant: "outline",
                                                            size: "icon",
                                                            className:
                                                              "h-9 w-9",
                                                            children: e.jsxDEV(
                                                              Te,
                                                              {
                                                                className:
                                                                  "h-4 w-4",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                lineNumber: 499,
                                                                columnNumber: 29,
                                                              },
                                                              this,
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                            lineNumber: 498,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 497,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      $e,
                                                      {
                                                        align: "end",
                                                        children: [
                                                          e.jsxDEV(
                                                            oe,
                                                            {
                                                              onClick: () =>
                                                                c(s),
                                                              children: [
                                                                e.jsxDEV(
                                                                  Me,
                                                                  {
                                                                    className:
                                                                      "h-4 w-4 mr-2",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                    lineNumber: 504,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                                "Edit Show",
                                                              ],
                                                            },
                                                            void 0,
                                                            !0,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                              lineNumber: 503,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            Re,
                                                            {},
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                              lineNumber: 507,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            oe,
                                                            {
                                                              className:
                                                                "text-destructive",
                                                              onClick: () =>
                                                                M(s.id),
                                                              children: [
                                                                e.jsxDEV(
                                                                  L,
                                                                  {
                                                                    className:
                                                                      "h-4 w-4 mr-2",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                    lineNumber: 512,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                                "Delete Show",
                                                              ],
                                                            },
                                                            void 0,
                                                            !0,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                              lineNumber: 508,
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
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 502,
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
                                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                  lineNumber: 496,
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
                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                            lineNumber: 480,
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
                                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                                      lineNumber: 440,
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
                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                lineNumber: 438,
                                columnNumber: 15,
                              },
                              this,
                            ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                      lineNumber: 420,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    Z,
                    {
                      value: "past",
                      children: e.jsxDEV(
                        "div",
                        {
                          className: "space-y-4",
                          children: [
                            re.map((s) =>
                              e.jsxDEV(
                                h,
                                {
                                  className:
                                    "flex flex-col md:flex-row items-center p-4 gap-4 opacity-70 hover:opacity-100 transition-opacity",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "bg-muted h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0",
                                        children: e.jsxDEV(
                                          H,
                                          {
                                            className:
                                              "h-6 w-6 text-muted-foreground",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                            lineNumber: 529,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 528,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "flex-1 text-center md:text-left",
                                        children: [
                                          e.jsxDEV(
                                            "h4",
                                            {
                                              className: "font-bold",
                                              children: s.name,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 532,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-sm text-muted-foreground",
                                              children: [
                                                s.venue,
                                                " • ",
                                                s.city,
                                                " • ",
                                                b(
                                                  new Date(s.date),
                                                  "MMM d, yyyy",
                                                ),
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 533,
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
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 531,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "flex gap-4 text-center",
                                        children: [
                                          e.jsxDEV(
                                            "div",
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  "p",
                                                  {
                                                    className:
                                                      "text-xs text-muted-foreground uppercase",
                                                    children: "Revenue",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 537,
                                                    columnNumber: 23,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "p",
                                                  {
                                                    className:
                                                      "font-bold text-green-600",
                                                    children: [
                                                      "$",
                                                      s.revenue?.toLocaleString() ||
                                                        "0",
                                                    ],
                                                  },
                                                  void 0,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 538,
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
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 536,
                                              columnNumber: 21,
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
                                                      "text-xs text-muted-foreground uppercase",
                                                    children: "Attendance",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 541,
                                                    columnNumber: 23,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "p",
                                                  {
                                                    className: "font-bold",
                                                    children: s.ticketsSold,
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 542,
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
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 540,
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
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 535,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      i,
                                      {
                                        variant: "ghost",
                                        size: "icon",
                                        onClick: () => M(s.id),
                                        children: e.jsxDEV(
                                          L,
                                          {
                                            className:
                                              "h-4 w-4 text-destructive",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                            lineNumber: 546,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 545,
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
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 527,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                            ),
                            re.length === 0 &&
                              e.jsxDEV(
                                "p",
                                {
                                  className:
                                    "text-center py-12 text-muted-foreground",
                                  children: "No past shows found.",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 551,
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
                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                          lineNumber: 525,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                      lineNumber: 524,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    Z,
                    {
                      value: "setlists",
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
                                    "p",
                                    {
                                      className:
                                        "text-sm text-muted-foreground",
                                      children: [
                                        U.length,
                                        " setlist",
                                        U.length !== 1 ? "s" : "",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                                      lineNumber: 559,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    B,
                                    {
                                      open: he,
                                      onOpenChange: C,
                                      children: [
                                        e.jsxDEV(
                                          le,
                                          {
                                            asChild: !0,
                                            children: e.jsxDEV(
                                              i,
                                              {
                                                size: "sm",
                                                children: [
                                                  e.jsxDEV(
                                                    k,
                                                    {
                                                      className: "h-4 w-4 mr-2",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                      lineNumber: 563,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  "New Setlist",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                lineNumber: 562,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                            lineNumber: 561,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          Y,
                                          {
                                            className: "max-w-lg",
                                            children: [
                                              e.jsxDEV(
                                                W,
                                                {
                                                  children: [
                                                    e.jsxDEV(
                                                      _,
                                                      {
                                                        children:
                                                          "Create Setlist",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 569,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      G,
                                                      {
                                                        children:
                                                          "Build a setlist for your upcoming performance.",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 570,
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
                                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                  lineNumber: 568,
                                                  columnNumber: 21,
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
                                                        className: "space-y-1",
                                                        children: [
                                                          e.jsxDEV(
                                                            t,
                                                            {
                                                              htmlFor:
                                                                "setlist-name",
                                                              children:
                                                                "Setlist Name",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                              lineNumber: 574,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            l,
                                                            {
                                                              id: "setlist-name",
                                                              placeholder:
                                                                "e.g. Summer Tour 2025 Main Set",
                                                              value: f.name,
                                                              onChange: (s) =>
                                                                g((r) => ({
                                                                  ...r,
                                                                  name: s.target
                                                                    .value,
                                                                })),
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                              lineNumber: 575,
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
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 573,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: "space-y-2",
                                                        children: [
                                                          e.jsxDEV(
                                                            t,
                                                            {
                                                              children:
                                                                "Tracks",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                              lineNumber: 583,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          f.tracks.length > 0 &&
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "space-y-1.5 max-h-40 overflow-y-auto pr-1",
                                                                children:
                                                                  f.tracks.map(
                                                                    (s, r) =>
                                                                      e.jsxDEV(
                                                                        "div",
                                                                        {
                                                                          className:
                                                                            "flex items-center justify-between px-3 py-2 rounded-md bg-muted text-sm",
                                                                          children:
                                                                            [
                                                                              e.jsxDEV(
                                                                                "span",
                                                                                {
                                                                                  className:
                                                                                    "font-medium",
                                                                                  children:
                                                                                    s.title,
                                                                                },
                                                                                void 0,
                                                                                !1,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                                  lineNumber: 588,
                                                                                  columnNumber: 33,
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
                                                                                      s.duration &&
                                                                                        e.jsxDEV(
                                                                                          "span",
                                                                                          {
                                                                                            className:
                                                                                              "text-muted-foreground text-xs",
                                                                                            children:
                                                                                              s.duration,
                                                                                          },
                                                                                          void 0,
                                                                                          !1,
                                                                                          {
                                                                                            fileName:
                                                                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                                            lineNumber: 590,
                                                                                            columnNumber: 50,
                                                                                          },
                                                                                          this,
                                                                                        ),
                                                                                      e.jsxDEV(
                                                                                        i,
                                                                                        {
                                                                                          variant:
                                                                                            "ghost",
                                                                                          size: "icon",
                                                                                          className:
                                                                                            "h-6 w-6",
                                                                                          onClick:
                                                                                            () =>
                                                                                              g(
                                                                                                (
                                                                                                  u,
                                                                                                ) => ({
                                                                                                  ...u,
                                                                                                  tracks:
                                                                                                    u.tracks.filter(
                                                                                                      (
                                                                                                        S,
                                                                                                        Q,
                                                                                                      ) =>
                                                                                                        Q !==
                                                                                                        r,
                                                                                                    ),
                                                                                                }),
                                                                                              ),
                                                                                          children:
                                                                                            e.jsxDEV(
                                                                                              L,
                                                                                              {
                                                                                                className:
                                                                                                  "h-3 w-3",
                                                                                              },
                                                                                              void 0,
                                                                                              !1,
                                                                                              {
                                                                                                fileName:
                                                                                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                                                lineNumber: 597,
                                                                                                columnNumber: 37,
                                                                                              },
                                                                                              this,
                                                                                            ),
                                                                                        },
                                                                                        void 0,
                                                                                        !1,
                                                                                        {
                                                                                          fileName:
                                                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                                          lineNumber: 591,
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
                                                                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                                  lineNumber: 589,
                                                                                  columnNumber: 33,
                                                                                },
                                                                                this,
                                                                              ),
                                                                            ],
                                                                        },
                                                                        r,
                                                                        !0,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                          lineNumber: 587,
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
                                                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                lineNumber: 585,
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
                                                                  l,
                                                                  {
                                                                    placeholder:
                                                                      "Track title",
                                                                    value:
                                                                      x.title,
                                                                    onChange: (
                                                                      s,
                                                                    ) =>
                                                                      v(
                                                                        (
                                                                          r,
                                                                        ) => ({
                                                                          ...r,
                                                                          title:
                                                                            s
                                                                              .target
                                                                              .value,
                                                                        }),
                                                                      ),
                                                                    onKeyDown: (
                                                                      s,
                                                                    ) => {
                                                                      s.key ===
                                                                        "Enter" &&
                                                                        x.title.trim() &&
                                                                        (g(
                                                                          (
                                                                            r,
                                                                          ) => ({
                                                                            ...r,
                                                                            tracks:
                                                                              [
                                                                                ...r.tracks,
                                                                                {
                                                                                  ...x,
                                                                                },
                                                                              ],
                                                                          }),
                                                                        ),
                                                                        v({
                                                                          title:
                                                                            "",
                                                                          duration:
                                                                            "",
                                                                          notes:
                                                                            "",
                                                                        }));
                                                                    },
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                    lineNumber: 605,
                                                                    columnNumber: 27,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  l,
                                                                  {
                                                                    placeholder:
                                                                      "Duration",
                                                                    className:
                                                                      "w-24",
                                                                    value:
                                                                      x.duration,
                                                                    onChange: (
                                                                      s,
                                                                    ) =>
                                                                      v(
                                                                        (
                                                                          r,
                                                                        ) => ({
                                                                          ...r,
                                                                          duration:
                                                                            s
                                                                              .target
                                                                              .value,
                                                                        }),
                                                                      ),
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                    lineNumber: 616,
                                                                    columnNumber: 27,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  i,
                                                                  {
                                                                    type: "button",
                                                                    variant:
                                                                      "outline",
                                                                    size: "icon",
                                                                    onClick:
                                                                      () => {
                                                                        x.title.trim() &&
                                                                          (g(
                                                                            (
                                                                              s,
                                                                            ) => ({
                                                                              ...s,
                                                                              tracks:
                                                                                [
                                                                                  ...s.tracks,
                                                                                  {
                                                                                    ...x,
                                                                                  },
                                                                                ],
                                                                            }),
                                                                          ),
                                                                          v({
                                                                            title:
                                                                              "",
                                                                            duration:
                                                                              "",
                                                                            notes:
                                                                              "",
                                                                          }));
                                                                      },
                                                                    children:
                                                                      e.jsxDEV(
                                                                        k,
                                                                        {
                                                                          className:
                                                                            "h-4 w-4",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                          lineNumber: 632,
                                                                          columnNumber: 29,
                                                                        },
                                                                        this,
                                                                      ),
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                    lineNumber: 622,
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
                                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                              lineNumber: 604,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "p",
                                                            {
                                                              className:
                                                                "text-xs text-muted-foreground",
                                                              children:
                                                                "Press Enter or click + to add a track",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                              lineNumber: 635,
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
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 582,
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
                                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                  lineNumber: 572,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                J,
                                                {
                                                  children: [
                                                    e.jsxDEV(
                                                      i,
                                                      {
                                                        variant: "outline",
                                                        onClick: () => C(!1),
                                                        children: "Cancel",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 639,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      i,
                                                      {
                                                        onClick: () =>
                                                          $.mutate(f),
                                                        disabled:
                                                          !f.name.trim() ||
                                                          $.isPending,
                                                        children: $.isPending
                                                          ? "Creating…"
                                                          : "Create Setlist",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                        lineNumber: 640,
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
                                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                  lineNumber: 638,
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
                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                            lineNumber: 567,
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
                                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                                      lineNumber: 560,
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
                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                lineNumber: 558,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            U.length === 0
                              ? e.jsxDEV(
                                  h,
                                  {
                                    className: "p-12 text-center",
                                    children: [
                                      e.jsxDEV(
                                        Ue,
                                        {
                                          className:
                                            "h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                          lineNumber: 653,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "h3",
                                        {
                                          className: "text-xl font-medium",
                                          children: "No setlists yet",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                          lineNumber: 654,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "text-muted-foreground mt-2 max-w-md mx-auto",
                                          children:
                                            "Create your first setlist to organize tracks for your live performances.",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                          lineNumber: 655,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        i,
                                        {
                                          className: "mt-6",
                                          onClick: () => C(!0),
                                          children: [
                                            e.jsxDEV(
                                              k,
                                              { className: "h-4 w-4 mr-2" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                lineNumber: 659,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            "Create Your First Setlist",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                          lineNumber: 658,
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
                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                    lineNumber: 652,
                                    columnNumber: 17,
                                  },
                                  this,
                                )
                              : e.jsxDEV(
                                  "div",
                                  {
                                    className: "grid gap-4 md:grid-cols-2",
                                    children: U.map((s) => {
                                      const r = s.tracks || [];
                                      return e.jsxDEV(
                                        h,
                                        {
                                          className: "flex flex-col",
                                          children: [
                                            e.jsxDEV(
                                              D,
                                              {
                                                className: "pb-2",
                                                children: e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "flex items-start justify-between",
                                                    children: [
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          children: [
                                                            e.jsxDEV(
                                                              E,
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
                                                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                lineNumber: 672,
                                                                columnNumber: 31,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              te,
                                                              {
                                                                children: [
                                                                  r.length,
                                                                  " track",
                                                                  r.length !== 1
                                                                    ? "s"
                                                                    : "",
                                                                ],
                                                              },
                                                              void 0,
                                                              !0,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                lineNumber: 673,
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
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                          lineNumber: 671,
                                                          columnNumber: 29,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        i,
                                                        {
                                                          variant: "ghost",
                                                          size: "icon",
                                                          className:
                                                            "h-8 w-8 text-muted-foreground hover:text-destructive",
                                                          onClick: () =>
                                                            pe.mutate(s.id),
                                                          children: e.jsxDEV(
                                                            L,
                                                            {
                                                              className:
                                                                "h-4 w-4",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                              lineNumber: 681,
                                                              columnNumber: 31,
                                                            },
                                                            this,
                                                          ),
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                          lineNumber: 675,
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
                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                    lineNumber: 670,
                                                    columnNumber: 27,
                                                  },
                                                  this,
                                                ),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                lineNumber: 669,
                                                columnNumber: 25,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              j,
                                              {
                                                className: "flex-1",
                                                children:
                                                  r.length === 0
                                                    ? e.jsxDEV(
                                                        "p",
                                                        {
                                                          className:
                                                            "text-sm text-muted-foreground",
                                                          children:
                                                            "No tracks added yet.",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                          lineNumber: 687,
                                                          columnNumber: 29,
                                                        },
                                                        this,
                                                      )
                                                    : e.jsxDEV(
                                                        "ol",
                                                        {
                                                          className:
                                                            "space-y-1",
                                                          children: [
                                                            r
                                                              .slice(0, 5)
                                                              .map((u, S) =>
                                                                e.jsxDEV(
                                                                  "li",
                                                                  {
                                                                    className:
                                                                      "flex items-center justify-between text-sm",
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        "span",
                                                                        {
                                                                          className:
                                                                            "flex items-center gap-2",
                                                                          children:
                                                                            [
                                                                              e.jsxDEV(
                                                                                "span",
                                                                                {
                                                                                  className:
                                                                                    "text-muted-foreground w-4 text-right",
                                                                                  children:
                                                                                    [
                                                                                      S +
                                                                                        1,
                                                                                      ".",
                                                                                    ],
                                                                                },
                                                                                void 0,
                                                                                !0,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                                  lineNumber: 693,
                                                                                  columnNumber: 37,
                                                                                },
                                                                                this,
                                                                              ),
                                                                              u.title,
                                                                            ],
                                                                        },
                                                                        void 0,
                                                                        !0,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                          lineNumber: 692,
                                                                          columnNumber: 35,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      u.duration &&
                                                                        e.jsxDEV(
                                                                          "span",
                                                                          {
                                                                            className:
                                                                              "text-xs text-muted-foreground",
                                                                            children:
                                                                              u.duration,
                                                                          },
                                                                          void 0,
                                                                          !1,
                                                                          {
                                                                            fileName:
                                                                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                            lineNumber: 696,
                                                                            columnNumber: 50,
                                                                          },
                                                                          this,
                                                                        ),
                                                                    ],
                                                                  },
                                                                  S,
                                                                  !0,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                    lineNumber: 691,
                                                                    columnNumber: 33,
                                                                  },
                                                                  this,
                                                                ),
                                                              ),
                                                            r.length > 5 &&
                                                              e.jsxDEV(
                                                                "li",
                                                                {
                                                                  className:
                                                                    "text-xs text-muted-foreground pl-6",
                                                                  children: [
                                                                    "+",
                                                                    r.length -
                                                                      5,
                                                                    " more tracks",
                                                                  ],
                                                                },
                                                                void 0,
                                                                !0,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                                  lineNumber: 700,
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
                                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                          lineNumber: 689,
                                                          columnNumber: 29,
                                                        },
                                                        this,
                                                      ),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                                lineNumber: 685,
                                                columnNumber: 25,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        s.id,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                                          lineNumber: 668,
                                          columnNumber: 23,
                                        },
                                        this,
                                      );
                                    }),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                                    lineNumber: 664,
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
                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                          lineNumber: 557,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                      lineNumber: 556,
                      columnNumber: 11,
                    },
                    this,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName: "/home/runner/workspace/client/src/pages/Shows.tsx",
                lineNumber: 413,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              Qe,
              {
                open: !!O,
                onOpenChange: (s) => !s && M(null),
                children: e.jsxDEV(
                  Ie,
                  {
                    children: [
                      e.jsxDEV(
                        He,
                        {
                          children: [
                            e.jsxDEV(
                              Be,
                              { children: "Delete Show" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                lineNumber: 718,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              Ye,
                              {
                                children:
                                  "Are you sure you want to delete this show? This action cannot be undone.",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                lineNumber: 719,
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
                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                          lineNumber: 717,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        We,
                        {
                          children: [
                            e.jsxDEV(
                              _e,
                              { children: "Cancel" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                lineNumber: 724,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              Ge,
                              {
                                className:
                                  "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                                onClick: () => {
                                  O && (de.mutate(O), M(null));
                                },
                                children: "Delete Show",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Shows.tsx",
                                lineNumber: 725,
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
                            "/home/runner/workspace/client/src/pages/Shows.tsx",
                          lineNumber: 723,
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
                      "/home/runner/workspace/client/src/pages/Shows.tsx",
                    lineNumber: 716,
                    columnNumber: 11,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName: "/home/runner/workspace/client/src/pages/Shows.tsx",
                lineNumber: 715,
                columnNumber: 9,
              },
              this,
            ),
            n &&
              e.jsxDEV(
                B,
                {
                  open: !!n,
                  onOpenChange: (s) => !s && c(null),
                  children: e.jsxDEV(
                    Y,
                    {
                      className: "max-w-md",
                      children: [
                        e.jsxDEV(
                          W,
                          {
                            children: [
                              e.jsxDEV(
                                _,
                                { children: "Edit Show" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 745,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                G,
                                {
                                  children:
                                    "Update the details for this performance.",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 746,
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
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 744,
                            columnNumber: 15,
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
                                  className: "space-y-2",
                                  children: [
                                    e.jsxDEV(
                                      t,
                                      { children: "Show Name" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 750,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      l,
                                      {
                                        value: n.name,
                                        onChange: (s) =>
                                          c({ ...n, name: s.target.value }),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 751,
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
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 749,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "grid grid-cols-2 gap-4",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "space-y-2",
                                        children: [
                                          e.jsxDEV(
                                            t,
                                            { children: "Venue" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 758,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            l,
                                            {
                                              value: n.venue || "",
                                              onChange: (s) =>
                                                c({
                                                  ...n,
                                                  venue: s.target.value,
                                                }),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 759,
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
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 757,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "space-y-2",
                                        children: [
                                          e.jsxDEV(
                                            t,
                                            { children: "City" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 765,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            l,
                                            {
                                              value: n.city || "",
                                              onChange: (s) =>
                                                c({
                                                  ...n,
                                                  city: s.target.value,
                                                }),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Shows.tsx",
                                              lineNumber: 766,
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
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 764,
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
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 756,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-2",
                                  children: [
                                    e.jsxDEV(
                                      t,
                                      { children: "Date & Time" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 773,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      l,
                                      {
                                        type: "datetime-local",
                                        value: n.date
                                          ? new Date(n.date)
                                              .toISOString()
                                              .slice(0, 16)
                                          : "",
                                        onChange: (s) =>
                                          c({ ...n, date: s.target.value }),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 774,
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
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 772,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-2",
                                  children: [
                                    e.jsxDEV(
                                      t,
                                      { children: "Ticket URL" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 781,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      l,
                                      {
                                        value: n.ticketUrl || "",
                                        placeholder: "https://...",
                                        onChange: (s) =>
                                          c({
                                            ...n,
                                            ticketUrl: s.target.value,
                                          }),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Shows.tsx",
                                        lineNumber: 782,
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
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 780,
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
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 748,
                            columnNumber: 15,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          J,
                          {
                            children: [
                              e.jsxDEV(
                                i,
                                {
                                  variant: "outline",
                                  onClick: () => c(null),
                                  children: "Cancel",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 790,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                i,
                                {
                                  onClick: async () => {
                                    try {
                                      (await V("PATCH", `/api/shows/${n.id}`, {
                                        name: n.name,
                                        venue: n.venue,
                                        city: n.city,
                                        date: n.date,
                                        ticketUrl: n.ticketUrl,
                                      }),
                                        d.invalidateQueries({
                                          queryKey: ["/api/shows"],
                                        }),
                                        c(null),
                                        N({
                                          title: "Show updated",
                                          description:
                                            "Your show details have been saved.",
                                        }));
                                    } catch {
                                      N({
                                        title: "Error",
                                        description: "Failed to update show.",
                                        variant: "destructive",
                                      });
                                    }
                                  },
                                  children: "Save Changes",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Shows.tsx",
                                  lineNumber: 791,
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
                              "/home/runner/workspace/client/src/pages/Shows.tsx",
                            lineNumber: 789,
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
                        "/home/runner/workspace/client/src/pages/Shows.tsx",
                      lineNumber: 743,
                      columnNumber: 13,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName: "/home/runner/workspace/client/src/pages/Shows.tsx",
                  lineNumber: 742,
                  columnNumber: 11,
                },
                this,
              ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Shows.tsx",
          lineNumber: 173,
          columnNumber: 7,
        },
        this,
      ),
    },
    void 0,
    !1,
    {
      fileName: "/home/runner/workspace/client/src/pages/Shows.tsx",
      lineNumber: 172,
      columnNumber: 5,
    },
    this,
  );
}
export { ws as default };
