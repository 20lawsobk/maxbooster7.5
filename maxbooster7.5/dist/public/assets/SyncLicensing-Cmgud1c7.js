import {
  r as V,
  aH as T,
  aI as E,
  f as e,
  bS as C,
  ai as F,
  aO as Y,
  b$ as G,
  cU as _,
  a_ as z,
  ca as W,
  d7 as X,
  bu as Z,
} from "./vendor-react-31oK5L0i.js";
import { A as J } from "./AppLayout-D2pri0rw.js";
import {
  u as ee,
  o as A,
  ae as ne,
  j as o,
  p as M,
  r as P,
  v as q,
  L as s,
  I as i,
  ac as I,
  C as u,
  d as N,
  f as d,
  h,
  a8 as t,
  a0 as se,
  a1 as ie,
  a2 as re,
  a3 as B,
  a7 as ce,
  W as le,
  X as ae,
  Y as me,
  Z as te,
  $ as f,
  H as oe,
  K as ue,
  M as Ne,
  N as de,
  O as he,
  Q as pe,
  R as ge,
  U as be,
  q as p,
  a as L,
  B as g,
} from "./studio-DOUfHW5v.js";
import {
  T as xe,
  a as fe,
  b as O,
  c as l,
  d as ye,
  e as a,
} from "./table-BLAeU9Q6.js";
import { a as ve } from "./useRequireAuth-K5x5riUd.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./TopBar-jcH3P98k.js";
import "./index-D5xLbTBZ.js";
import "./vendor-animation-CFQslDag.js";
function Ae() {
  const { user: R } = ve(),
    { toast: y } = ee(),
    [H, v] = V.useState(!1),
    [r, b] = V.useState(null),
    [w, k] = V.useState(null),
    { data: j = [], isLoading: K } = T({ queryKey: ["/api/sync-licensing"] }),
    { data: x } = T({ queryKey: ["/api/sync-licensing/stats"] }),
    D = E({
      mutationFn: async (n) =>
        (await L("POST", "/api/sync-licensing", n)).json(),
      onSuccess: () => {
        (p.invalidateQueries({ queryKey: ["/api/sync-licensing"] }),
          p.invalidateQueries({ queryKey: ["/api/sync-licensing/stats"] }),
          v(!1),
          y({
            title: "Track added",
            description: "Your track is now in the sync catalog.",
          }));
      },
    }),
    S = E({
      mutationFn: async ({ id: n, ...m }) =>
        (await L("PUT", `/api/sync-licensing/${n}`, m)).json(),
      onSuccess: () => {
        (p.invalidateQueries({ queryKey: ["/api/sync-licensing"] }),
          b(null),
          y({ title: "Track updated" }));
      },
    }),
    U = E({
      mutationFn: async (n) => {
        await L("DELETE", `/api/sync-licensing/${n}`);
      },
      onSuccess: () => {
        (p.invalidateQueries({ queryKey: ["/api/sync-licensing"] }),
          p.invalidateQueries({ queryKey: ["/api/sync-licensing/stats"] }),
          y({ title: "Track removed from catalog" }));
      },
    }),
    $ = (n) => {
      n.preventDefault();
      const m = new FormData(n.currentTarget),
        c = Object.fromEntries(m.entries());
      D.mutate({ ...c, bpm: c.bpm ? parseInt(c.bpm) : void 0 });
    },
    Q = (n) => {
      switch (n) {
        case "available":
          return e.jsxDEV(
            g,
            {
              variant: "outline",
              className: "border-blue-500/30 text-blue-400 bg-blue-500/10",
              children: "Available",
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
              lineNumber: 134,
              columnNumber: 16,
            },
            this,
          );
        case "submitted":
          return e.jsxDEV(
            g,
            {
              variant: "outline",
              className:
                "border-yellow-500/30 text-yellow-400 bg-yellow-500/10",
              children: "Submitted",
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
              lineNumber: 136,
              columnNumber: 16,
            },
            this,
          );
        case "under_review":
          return e.jsxDEV(
            g,
            {
              variant: "outline",
              className:
                "border-orange-500/30 text-orange-400 bg-orange-500/10",
              children: "Under Review",
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
              lineNumber: 138,
              columnNumber: 16,
            },
            this,
          );
        case "licensed":
          return e.jsxDEV(
            g,
            {
              variant: "outline",
              className: "border-green-500/30 text-green-400 bg-green-500/10",
              children: "Licensed ✓",
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
              lineNumber: 140,
              columnNumber: 16,
            },
            this,
          );
        default:
          return e.jsxDEV(
            g,
            { variant: "outline", children: n },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
              lineNumber: 142,
              columnNumber: 16,
            },
            this,
          );
      }
    };
  return R
    ? e.jsxDEV(
        J,
        {
          children: [
            e.jsxDEV(
              "div",
              {
                className: "p-6 space-y-8",
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
                                    "text-3xl font-bold gradient-text mb-2 flex items-center gap-2",
                                  children: [
                                    e.jsxDEV(
                                      C,
                                      { className: "w-8 h-8" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 154,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    "Sync Licensing",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                  lineNumber: 153,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-muted-foreground",
                                  children: "Put Your Music in TV, Film & Ads",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                  lineNumber: 157,
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
                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                            lineNumber: 152,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          A,
                          {
                            open: H,
                            onOpenChange: v,
                            children: [
                              e.jsxDEV(
                                ne,
                                {
                                  asChild: !0,
                                  children: e.jsxDEV(
                                    o,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          F,
                                          { className: "w-4 h-4 mr-2" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                            lineNumber: 162,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        "Add to Catalog",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
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
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                  lineNumber: 160,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                M,
                                {
                                  className: "max-w-2xl",
                                  children: [
                                    e.jsxDEV(
                                      P,
                                      {
                                        children: e.jsxDEV(
                                          q,
                                          {
                                            children:
                                              "Add Track to Sync Catalog",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                            lineNumber: 168,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 167,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "form",
                                      {
                                        onSubmit: $,
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
                                                    className: "space-y-2",
                                                    children: [
                                                      e.jsxDEV(
                                                        s,
                                                        {
                                                          htmlFor: "trackTitle",
                                                          children:
                                                            "Track Title",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 173,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        i,
                                                        {
                                                          id: "trackTitle",
                                                          name: "trackTitle",
                                                          required: !0,
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 174,
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
                                                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                    lineNumber: 172,
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
                                                        s,
                                                        {
                                                          htmlFor: "artistName",
                                                          children:
                                                            "Artist Name",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 177,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        i,
                                                        {
                                                          id: "artistName",
                                                          name: "artistName",
                                                          required: !0,
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 178,
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
                                                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                    lineNumber: 176,
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
                                                        s,
                                                        {
                                                          htmlFor: "genre",
                                                          children: "Genre",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 181,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        i,
                                                        {
                                                          id: "genre",
                                                          name: "genre",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 182,
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
                                                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                    lineNumber: 180,
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
                                                        s,
                                                        {
                                                          htmlFor: "mood",
                                                          children: "Mood Tags",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 185,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        i,
                                                        {
                                                          id: "mood",
                                                          name: "mood",
                                                          placeholder:
                                                            "Epic, Dark, Happy",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 186,
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
                                                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                    lineNumber: 184,
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
                                                        s,
                                                        {
                                                          htmlFor: "bpm",
                                                          children: "BPM",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 189,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        i,
                                                        {
                                                          id: "bpm",
                                                          name: "bpm",
                                                          type: "number",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 190,
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
                                                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                    lineNumber: 188,
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
                                                        s,
                                                        {
                                                          htmlFor: "usageType",
                                                          children:
                                                            "Usage Type",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 193,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        i,
                                                        {
                                                          id: "usageType",
                                                          name: "usageType",
                                                          placeholder:
                                                            "TV/Film/Ads",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 194,
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
                                                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                    lineNumber: 192,
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
                                                        s,
                                                        {
                                                          htmlFor: "price",
                                                          children:
                                                            "Licensing Price ($)",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 197,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        i,
                                                        {
                                                          id: "price",
                                                          name: "price",
                                                          type: "number",
                                                          step: "0.01",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 198,
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
                                                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
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
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 171,
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
                                                  s,
                                                  {
                                                    htmlFor: "description",
                                                    children: "Description",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                    lineNumber: 202,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "textarea",
                                                  {
                                                    id: "description",
                                                    name: "description",
                                                    className:
                                                      "w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                    lineNumber: 203,
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
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 201,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            I,
                                            {
                                              children: e.jsxDEV(
                                                o,
                                                {
                                                  type: "submit",
                                                  disabled: D.isPending,
                                                  children: D.isPending
                                                    ? "Adding..."
                                                    : "Add Track",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                  lineNumber: 210,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 209,
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
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 170,
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
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                  lineNumber: 166,
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
                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
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
                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                      lineNumber: 151,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "grid grid-cols-1 md:grid-cols-4 gap-4",
                      children: [
                        e.jsxDEV(
                          u,
                          {
                            children: [
                              e.jsxDEV(
                                N,
                                {
                                  className:
                                    "flex flex-row items-center justify-between space-y-0 pb-2",
                                  children: [
                                    e.jsxDEV(
                                      d,
                                      {
                                        className: "text-sm font-medium",
                                        children: "Catalog Size",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 222,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      Y,
                                      {
                                        className:
                                          "h-4 h-4 text-muted-foreground",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 223,
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
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                  lineNumber: 221,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                h,
                                {
                                  children: e.jsxDEV(
                                    "div",
                                    {
                                      className: "text-2xl font-bold",
                                      children: x?.totalTracks || 0,
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                      lineNumber: 226,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                  lineNumber: 225,
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
                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                            lineNumber: 220,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          u,
                          {
                            children: [
                              e.jsxDEV(
                                N,
                                {
                                  className:
                                    "flex flex-row items-center justify-between space-y-0 pb-2",
                                  children: [
                                    e.jsxDEV(
                                      d,
                                      {
                                        className: "text-sm font-medium",
                                        children: "Licensed Tracks",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 231,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      G,
                                      {
                                        className:
                                          "h-4 h-4 text-muted-foreground",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 232,
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
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                  lineNumber: 230,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                h,
                                {
                                  children: e.jsxDEV(
                                    "div",
                                    {
                                      className: "text-2xl font-bold",
                                      children: x?.licensedCount || 0,
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                      lineNumber: 235,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                  lineNumber: 234,
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
                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                            lineNumber: 229,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          u,
                          {
                            children: [
                              e.jsxDEV(
                                N,
                                {
                                  className:
                                    "flex flex-row items-center justify-between space-y-0 pb-2",
                                  children: [
                                    e.jsxDEV(
                                      d,
                                      {
                                        className: "text-sm font-medium",
                                        children: "Total Earnings",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 240,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      _,
                                      {
                                        className:
                                          "h-4 h-4 text-muted-foreground",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 241,
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
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                  lineNumber: 239,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                h,
                                {
                                  children: e.jsxDEV(
                                    "div",
                                    {
                                      className: "text-2xl font-bold",
                                      children: ["$", x?.revenue || 0],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                      lineNumber: 244,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                  lineNumber: 243,
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
                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                            lineNumber: 238,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          u,
                          {
                            children: [
                              e.jsxDEV(
                                N,
                                {
                                  className:
                                    "flex flex-row items-center justify-between space-y-0 pb-2",
                                  children: [
                                    e.jsxDEV(
                                      d,
                                      {
                                        className: "text-sm font-medium",
                                        children: "Pending",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 249,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      z,
                                      {
                                        className:
                                          "h-4 h-4 text-muted-foreground",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 250,
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
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                  lineNumber: 248,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                h,
                                {
                                  children: e.jsxDEV(
                                    "div",
                                    {
                                      className: "text-2xl font-bold",
                                      children: x?.pendingCount || 0,
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                      lineNumber: 253,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
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
                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                            lineNumber: 247,
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
                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                      lineNumber: 219,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    u,
                    {
                      children: [
                        e.jsxDEV(
                          N,
                          {
                            children: e.jsxDEV(
                              d,
                              { children: "Sync Catalog" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                lineNumber: 260,
                                columnNumber: 13,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                            lineNumber: 259,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          h,
                          {
                            children: K
                              ? e.jsxDEV(
                                  "div",
                                  {
                                    className: "space-y-2 py-2",
                                    children: [1, 2, 3, 4].map((n) =>
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-center gap-4 px-4 py-3 border-b last:border-0",
                                          children: [
                                            e.jsxDEV(
                                              t,
                                              { className: "h-4 w-36" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                lineNumber: 267,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              t,
                                              { className: "h-4 w-24" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                lineNumber: 268,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              t,
                                              { className: "h-4 w-12" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                lineNumber: 269,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              t,
                                              { className: "h-4 w-20" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                lineNumber: 270,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              t,
                                              {
                                                className:
                                                  "h-5 w-16 rounded-full",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                lineNumber: 271,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              t,
                                              { className: "h-4 w-14" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                lineNumber: 272,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        n,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                          lineNumber: 266,
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
                                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                    lineNumber: 264,
                                    columnNumber: 15,
                                  },
                                  this,
                                )
                              : j.length === 0
                                ? e.jsxDEV(
                                    "div",
                                    {
                                      className: "py-14 text-center space-y-5",
                                      children: [
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center",
                                            children: e.jsxDEV(
                                              C,
                                              {
                                                className:
                                                  "h-7 w-7 text-primary",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                lineNumber: 279,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                            lineNumber: 278,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "div",
                                          {
                                            children: [
                                              e.jsxDEV(
                                                "h3",
                                                {
                                                  className:
                                                    "text-lg font-semibold mb-1",
                                                  children:
                                                    "Your sync catalog is empty",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                  lineNumber: 282,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-sm text-muted-foreground max-w-sm mx-auto",
                                                  children:
                                                    "Add tracks to license your music to TV shows, films, ads, and video games. Include mood tags and BPM to help music supervisors find your work.",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                  lineNumber: 283,
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
                                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                            lineNumber: 281,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto text-left",
                                            children: [
                                              {
                                                icon: "🎬",
                                                label: "TV & Film",
                                                desc: "Score your music for television and movies",
                                              },
                                              {
                                                icon: "📢",
                                                label: "Advertising",
                                                desc: "License tracks for brand campaigns",
                                              },
                                              {
                                                icon: "🎮",
                                                label: "Video Games",
                                                desc: "Provide music for gaming environments",
                                              },
                                            ].map((n) =>
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "p-3 rounded-lg border bg-muted/30 text-center space-y-1",
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: "text-2xl",
                                                        children: n.icon,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                        lineNumber: 294,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className:
                                                          "text-xs font-medium",
                                                        children: n.label,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                        lineNumber: 295,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className:
                                                          "text-xs text-muted-foreground",
                                                        children: n.desc,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                        lineNumber: 296,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  ],
                                                },
                                                n.label,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                  lineNumber: 293,
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
                                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                            lineNumber: 287,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "button",
                                          {
                                            type: "button",
                                            onClick: () => v(!0),
                                            className:
                                              "inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors",
                                            children: [
                                              e.jsxDEV(
                                                F,
                                                { className: "h-4 w-4" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                  lineNumber: 305,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              "Add Your First Track",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                            lineNumber: 300,
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
                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                      lineNumber: 277,
                                      columnNumber: 15,
                                    },
                                    this,
                                  )
                                : e.jsxDEV(
                                    xe,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          fe,
                                          {
                                            children: e.jsxDEV(
                                              O,
                                              {
                                                children: [
                                                  e.jsxDEV(
                                                    l,
                                                    { children: "Track" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                      lineNumber: 313,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    l,
                                                    {
                                                      children: "Genre / Mood",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                      lineNumber: 314,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    l,
                                                    { children: "BPM" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                      lineNumber: 315,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    l,
                                                    { children: "Usage" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                      lineNumber: 316,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    l,
                                                    { children: "Status" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                      lineNumber: 317,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    l,
                                                    { children: "Price" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                      lineNumber: 318,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    l,
                                                    { className: "w-10" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                      lineNumber: 319,
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
                                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                lineNumber: 312,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                            lineNumber: 311,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          ye,
                                          {
                                            children: j.map((n) =>
                                              e.jsxDEV(
                                                O,
                                                {
                                                  children: [
                                                    e.jsxDEV(
                                                      a,
                                                      {
                                                        className:
                                                          "font-medium",
                                                        children: [
                                                          n.trackTitle,
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "text-xs text-muted-foreground",
                                                              children:
                                                                n.artistName,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                              lineNumber: 327,
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
                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                        lineNumber: 325,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      a,
                                                      {
                                                        children: [
                                                          n.genre || "—",
                                                          n.mood &&
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "text-xs text-muted-foreground",
                                                                children:
                                                                  n.mood,
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                                lineNumber: 331,
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
                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                        lineNumber: 329,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      a,
                                                      {
                                                        children: n.bpm || "—",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                        lineNumber: 333,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      a,
                                                      {
                                                        children:
                                                          n.usageType || "—",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                        lineNumber: 334,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      a,
                                                      { children: Q(n.status) },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                        lineNumber: 335,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      a,
                                                      {
                                                        className:
                                                          "font-medium",
                                                        children: [
                                                          "$",
                                                          n.price || "0.00",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                        lineNumber: 336,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      a,
                                                      {
                                                        children: e.jsxDEV(
                                                          se,
                                                          {
                                                            children: [
                                                              e.jsxDEV(
                                                                ie,
                                                                {
                                                                  asChild: !0,
                                                                  children:
                                                                    e.jsxDEV(
                                                                      o,
                                                                      {
                                                                        variant:
                                                                          "ghost",
                                                                        size: "icon",
                                                                        className:
                                                                          "h-7 w-7",
                                                                        children:
                                                                          e.jsxDEV(
                                                                            W,
                                                                            {
                                                                              className:
                                                                                "h-3.5 w-3.5",
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                                              lineNumber: 341,
                                                                              columnNumber: 31,
                                                                            },
                                                                            this,
                                                                          ),
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                                        lineNumber: 340,
                                                                        columnNumber: 29,
                                                                      },
                                                                      this,
                                                                    ),
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                                  lineNumber: 339,
                                                                  columnNumber: 27,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                re,
                                                                {
                                                                  align: "end",
                                                                  children: [
                                                                    e.jsxDEV(
                                                                      B,
                                                                      {
                                                                        onClick:
                                                                          () =>
                                                                            b(
                                                                              n,
                                                                            ),
                                                                        children:
                                                                          [
                                                                            e.jsxDEV(
                                                                              X,
                                                                              {
                                                                                className:
                                                                                  "h-4 w-4 mr-2",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                                                lineNumber: 346,
                                                                                columnNumber: 31,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            "Edit",
                                                                          ],
                                                                      },
                                                                      void 0,
                                                                      !0,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                                        lineNumber: 345,
                                                                        columnNumber: 29,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    e.jsxDEV(
                                                                      ce,
                                                                      {},
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                                        lineNumber: 349,
                                                                        columnNumber: 29,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    e.jsxDEV(
                                                                      B,
                                                                      {
                                                                        className:
                                                                          "text-destructive",
                                                                        onClick:
                                                                          () =>
                                                                            k(
                                                                              n.id,
                                                                            ),
                                                                        children:
                                                                          [
                                                                            e.jsxDEV(
                                                                              Z,
                                                                              {
                                                                                className:
                                                                                  "h-4 w-4 mr-2",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                                                lineNumber: 354,
                                                                                columnNumber: 31,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            "Remove",
                                                                          ],
                                                                      },
                                                                      void 0,
                                                                      !0,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                                        lineNumber: 350,
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
                                                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                                  lineNumber: 344,
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
                                                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                            lineNumber: 338,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                        lineNumber: 337,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  ],
                                                },
                                                n.id,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                  lineNumber: 324,
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
                                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                            lineNumber: 322,
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
                                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                      lineNumber: 310,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                            lineNumber: 262,
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
                        "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                      lineNumber: 258,
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
                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                lineNumber: 150,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              A,
              {
                open: !!r,
                onOpenChange: (n) => {
                  n || b(null);
                },
                children: e.jsxDEV(
                  M,
                  {
                    className: "max-w-2xl",
                    children: [
                      e.jsxDEV(
                        P,
                        {
                          children: e.jsxDEV(
                            q,
                            { children: "Edit Track" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                              lineNumber: 373,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                          lineNumber: 372,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      r &&
                        e.jsxDEV(
                          "form",
                          {
                            onSubmit: (n) => {
                              n.preventDefault();
                              const m = new FormData(n.currentTarget),
                                c = Object.fromEntries(m.entries());
                              S.mutate({
                                id: r.id,
                                ...c,
                                bpm: c.bpm ? parseInt(c.bpm) : void 0,
                              });
                            },
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
                                        className: "space-y-2",
                                        children: [
                                          e.jsxDEV(
                                            s,
                                            {
                                              htmlFor: "edit-trackTitle",
                                              children: "Track Title",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 388,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            i,
                                            {
                                              id: "edit-trackTitle",
                                              name: "trackTitle",
                                              defaultValue: r.trackTitle,
                                              required: !0,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 389,
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
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 387,
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
                                            s,
                                            {
                                              htmlFor: "edit-artistName",
                                              children: "Artist Name",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 392,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            i,
                                            {
                                              id: "edit-artistName",
                                              name: "artistName",
                                              defaultValue: r.artistName,
                                              required: !0,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 393,
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
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 391,
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
                                            s,
                                            {
                                              htmlFor: "edit-genre",
                                              children: "Genre",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 396,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            i,
                                            {
                                              id: "edit-genre",
                                              name: "genre",
                                              defaultValue: r.genre,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 397,
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
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 395,
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
                                            s,
                                            {
                                              htmlFor: "edit-mood",
                                              children: "Mood Tags",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 400,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            i,
                                            {
                                              id: "edit-mood",
                                              name: "mood",
                                              defaultValue: r.mood,
                                              placeholder: "Epic, Dark, Happy",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 401,
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
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 399,
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
                                            s,
                                            {
                                              htmlFor: "edit-bpm",
                                              children: "BPM",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 404,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            i,
                                            {
                                              id: "edit-bpm",
                                              name: "bpm",
                                              type: "number",
                                              defaultValue: r.bpm,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 405,
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
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 403,
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
                                            s,
                                            {
                                              htmlFor: "edit-usageType",
                                              children: "Usage Type",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 408,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            i,
                                            {
                                              id: "edit-usageType",
                                              name: "usageType",
                                              defaultValue: r.usageType,
                                              placeholder: "TV/Film/Ads",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 409,
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
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 407,
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
                                            s,
                                            {
                                              htmlFor: "edit-price",
                                              children: "Licensing Price ($)",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 412,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            i,
                                            {
                                              id: "edit-price",
                                              name: "price",
                                              type: "number",
                                              step: "0.01",
                                              defaultValue: r.price,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 413,
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
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 411,
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
                                            s,
                                            {
                                              htmlFor: "edit-status",
                                              children: "Status",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 416,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            le,
                                            {
                                              name: "status",
                                              defaultValue: r.status,
                                              children: [
                                                e.jsxDEV(
                                                  ae,
                                                  {
                                                    children: e.jsxDEV(
                                                      me,
                                                      {},
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                        lineNumber: 418,
                                                        columnNumber: 36,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                    lineNumber: 418,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  te,
                                                  {
                                                    children: [
                                                      e.jsxDEV(
                                                        f,
                                                        {
                                                          value: "available",
                                                          children: "Available",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 420,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        f,
                                                        {
                                                          value: "submitted",
                                                          children: "Submitted",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 421,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        f,
                                                        {
                                                          value: "under_review",
                                                          children:
                                                            "Under Review",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 422,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        f,
                                                        {
                                                          value: "licensed",
                                                          children: "Licensed",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                          lineNumber: 423,
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
                                                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                                    lineNumber: 419,
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
                                                "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                              lineNumber: 417,
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
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 415,
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
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                  lineNumber: 386,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                I,
                                {
                                  children: [
                                    e.jsxDEV(
                                      o,
                                      {
                                        type: "button",
                                        variant: "outline",
                                        onClick: () => b(null),
                                        children: "Cancel",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 429,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      o,
                                      {
                                        type: "submit",
                                        disabled: S.isPending,
                                        children: S.isPending
                                          ? "Saving..."
                                          : "Save Changes",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                        lineNumber: 430,
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
                                    "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                  lineNumber: 428,
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
                              "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                            lineNumber: 376,
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
                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                    lineNumber: 371,
                    columnNumber: 9,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                lineNumber: 370,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              oe,
              {
                open: !!w,
                onOpenChange: (n) => {
                  n || k(null);
                },
                children: e.jsxDEV(
                  ue,
                  {
                    children: [
                      e.jsxDEV(
                        Ne,
                        {
                          children: [
                            e.jsxDEV(
                              de,
                              { children: "Remove from Catalog" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                lineNumber: 443,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              he,
                              {
                                children:
                                  "Are you sure you want to remove this track from your sync catalog? This cannot be undone.",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                lineNumber: 444,
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
                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                          lineNumber: 442,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        pe,
                        {
                          children: [
                            e.jsxDEV(
                              ge,
                              { children: "Cancel" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                lineNumber: 449,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              be,
                              {
                                className:
                                  "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                                onClick: () => {
                                  w && (U.mutate(w), k(null));
                                },
                                children: "Remove Track",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                                lineNumber: 450,
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
                            "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                          lineNumber: 448,
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
                      "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                    lineNumber: 441,
                    columnNumber: 9,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
                lineNumber: 440,
                columnNumber: 7,
              },
              this,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/SyncLicensing.tsx",
          lineNumber: 149,
          columnNumber: 5,
        },
        this,
      )
    : null;
}
export { Ae as default };
