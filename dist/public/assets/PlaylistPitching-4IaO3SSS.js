import {
  ah as _,
  r as d,
  aH as D,
  aI as j,
  f as e,
  ai as F,
  d0 as L,
  b$ as G,
  a_ as $,
  b7 as Y,
  bu as W,
  aK as X,
  aX as z,
  dc as Z,
  dq as J,
} from "./vendor-react-31oK5L0i.js";
import { a as ee } from "./useRequireAuth-K5x5riUd.js";
import { A as se } from "./AppLayout-D2pri0rw.js";
import {
  u as ie,
  j as a,
  C as n,
  h as g,
  a4 as le,
  a5 as re,
  a6 as U,
  a9 as R,
  a8 as p,
  W as E,
  X as V,
  Y as C,
  Z as S,
  $ as l,
  I as h,
  d as te,
  f as ae,
  B as c,
  o as ne,
  p as ce,
  r as me,
  v as oe,
  w as ue,
  L as m,
  y as he,
  ac as Ne,
  H as de,
  K as ge,
  M as pe,
  N as be,
  O as xe,
  Q as fe,
  R as Pe,
  U as ye,
  a as T,
} from "./studio-DOUfHW5v.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./index-D5xLbTBZ.js";
import "./vendor-animation-CFQslDag.js";
import "./TopBar-jcH3P98k.js";
function Fe() {
  ee();
  const { toast: b } = ie(),
    o = _(),
    [q, u] = d.useState(!1),
    [x, K] = d.useState(""),
    [f, Q] = d.useState("all"),
    [P, y] = d.useState(null),
    { data: v = [], isLoading: w } = D({
      queryKey: ["/api/playlist-pitching"],
    }),
    { data: I = [], isLoading: M } = D({
      queryKey: ["/api/playlist-pitching/curators"],
    }),
    { data: N } = D({ queryKey: ["/api/playlist-pitching/stats"] }),
    [i, r] = d.useState({
      trackTitle: "",
      artistName: "",
      genre: "",
      curatorName: "",
      playlistUrl: "",
      description: "",
      status: "submitted",
    }),
    k = j({
      mutationFn: async (s) =>
        (await T("POST", "/api/playlist-pitching", s)).json(),
      onSuccess: () => {
        (b({
          title: "Pitch created!",
          description: "Your submission has been tracked.",
        }),
          u(!1),
          r({
            trackTitle: "",
            artistName: "",
            genre: "",
            curatorName: "",
            playlistUrl: "",
            description: "",
            status: "submitted",
          }),
          o.invalidateQueries({ queryKey: ["/api/playlist-pitching"] }),
          o.invalidateQueries({ queryKey: ["/api/playlist-pitching/stats"] }));
      },
    }),
    H = j({
      mutationFn: async ({ id: s, status: t }) =>
        (await T("PUT", `/api/playlist-pitching/${s}`, { status: t })).json(),
      onSuccess: () => {
        (b({ title: "Status updated" }),
          o.invalidateQueries({ queryKey: ["/api/playlist-pitching"] }),
          o.invalidateQueries({ queryKey: ["/api/playlist-pitching/stats"] }));
      },
    }),
    O = j({
      mutationFn: async (s) => {
        await T("DELETE", `/api/playlist-pitching/${s}`);
      },
      onSuccess: () => {
        (b({ title: "Pitch removed" }),
          o.invalidateQueries({ queryKey: ["/api/playlist-pitching"] }),
          o.invalidateQueries({ queryKey: ["/api/playlist-pitching/stats"] }));
      },
    }),
    B = (s) => {
      switch (s) {
        case "draft":
          return e.jsxDEV(
            c,
            {
              variant: "outline",
              className: "bg-slate-500/10 text-slate-400 border-slate-500/20",
              children: "Draft",
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
              lineNumber: 169,
              columnNumber: 16,
            },
            this,
          );
        case "submitted":
          return e.jsxDEV(
            c,
            {
              variant: "outline",
              className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
              children: "Submitted",
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
              lineNumber: 171,
              columnNumber: 16,
            },
            this,
          );
        case "under_review":
          return e.jsxDEV(
            c,
            {
              variant: "outline",
              className:
                "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
              children: "Under Review",
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
              lineNumber: 173,
              columnNumber: 16,
            },
            this,
          );
        case "accepted":
          return e.jsxDEV(
            c,
            {
              variant: "outline",
              className: "bg-green-500/10 text-green-400 border-green-500/20",
              children: "Accepted",
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
              lineNumber: 175,
              columnNumber: 16,
            },
            this,
          );
        case "rejected":
          return e.jsxDEV(
            c,
            {
              variant: "outline",
              className: "bg-red-500/10 text-red-400 border-red-500/20",
              children: "Rejected",
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
              lineNumber: 177,
              columnNumber: 16,
            },
            this,
          );
        default:
          return e.jsxDEV(
            c,
            { variant: "outline", children: s },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
              lineNumber: 179,
              columnNumber: 16,
            },
            this,
          );
      }
    },
    A = I.filter(
      (s) =>
        (s.name.toLowerCase().includes(x.toLowerCase()) ||
          s.genre.toLowerCase().includes(x.toLowerCase())) &&
        (f === "all" || s.genre.toLowerCase().includes(f.toLowerCase())),
    );
  return e.jsxDEV(
    se,
    {
      children: e.jsxDEV(
        "div",
        {
          className: "p-6 max-w-7xl mx-auto space-y-8",
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
                              "text-3xl font-bold text-white tracking-tight",
                            children: "Playlist Pitching",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                            lineNumber: 194,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-gray-400",
                            children:
                              "Track your submissions and find the right curators for your music.",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                            lineNumber: 195,
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
                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                      lineNumber: 193,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    a,
                    {
                      onClick: () => u(!0),
                      className: "bg-purple-600 hover:bg-purple-700",
                      children: [
                        e.jsxDEV(
                          F,
                          { className: "w-4 h-4 mr-2" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                            lineNumber: 198,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        "Track New Pitch",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                      lineNumber: 197,
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
                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                lineNumber: 192,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                className:
                  "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4",
                children: [
                  e.jsxDEV(
                    n,
                    {
                      className: "bg-gray-900 border-gray-800",
                      children: e.jsxDEV(
                        g,
                        {
                          className: "pt-6",
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
                                          className: "text-sm text-gray-400",
                                          children: "Total Pitches",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                          lineNumber: 209,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "text-2xl font-bold text-white",
                                          children: N?.total || 0,
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                          lineNumber: 210,
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
                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                    lineNumber: 208,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "p-2 rounded-full bg-blue-500/10",
                                    children: e.jsxDEV(
                                      L,
                                      { className: "w-5 h-5 text-blue-500" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                        lineNumber: 213,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                    lineNumber: 212,
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
                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                              lineNumber: 207,
                              columnNumber: 15,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                          lineNumber: 206,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                      lineNumber: 205,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    n,
                    {
                      className: "bg-gray-900 border-gray-800",
                      children: e.jsxDEV(
                        g,
                        {
                          className: "pt-6",
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
                                          className: "text-sm text-gray-400",
                                          children: "Accepted",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                          lineNumber: 222,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "text-2xl font-bold text-green-500",
                                          children: N?.accepted || 0,
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                          lineNumber: 223,
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
                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                    lineNumber: 221,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "p-2 rounded-full bg-green-500/10",
                                    children: e.jsxDEV(
                                      G,
                                      { className: "w-5 h-5 text-green-500" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                        lineNumber: 226,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                    lineNumber: 225,
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
                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                              lineNumber: 220,
                              columnNumber: 15,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                          lineNumber: 219,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                      lineNumber: 218,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    n,
                    {
                      className: "bg-gray-900 border-gray-800",
                      children: e.jsxDEV(
                        g,
                        {
                          className: "pt-6",
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
                                          className: "text-sm text-gray-400",
                                          children: "Pending",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                          lineNumber: 235,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "text-2xl font-bold text-yellow-500",
                                          children: N?.pending || 0,
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                          lineNumber: 236,
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
                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                    lineNumber: 234,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "p-2 rounded-full bg-yellow-500/10",
                                    children: e.jsxDEV(
                                      $,
                                      { className: "w-5 h-5 text-yellow-500" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                        lineNumber: 239,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                    lineNumber: 238,
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
                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                              lineNumber: 233,
                              columnNumber: 15,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                          lineNumber: 232,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                      lineNumber: 231,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    n,
                    {
                      className: "bg-gray-900 border-gray-800",
                      children: e.jsxDEV(
                        g,
                        {
                          className: "pt-6 space-y-3",
                          children: [
                            e.jsxDEV(
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
                                            className: "text-sm text-gray-400",
                                            children: "Conversion Rate",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                            lineNumber: 248,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "p",
                                          {
                                            className:
                                              "text-2xl font-bold text-purple-500",
                                            children: [
                                              (N?.conversionRate || 0).toFixed(
                                                1,
                                              ),
                                              "%",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                            lineNumber: 249,
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
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 247,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className:
                                        "p-2 rounded-full bg-purple-500/10",
                                      children: e.jsxDEV(
                                        Y,
                                        {
                                          className: "w-5 h-5 text-purple-500",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                          lineNumber: 252,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 251,
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
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 246,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className:
                                  "w-full bg-gray-800 rounded-full h-1.5 overflow-hidden",
                                children: e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "bg-purple-500 h-full rounded-full transition-all",
                                    style: {
                                      width: `${Math.min(100, N?.conversionRate || 0)}%`,
                                    },
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                    lineNumber: 256,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 255,
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
                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                          lineNumber: 245,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                      lineNumber: 244,
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
                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                lineNumber: 204,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              le,
              {
                defaultValue: "my-pitches",
                className: "w-full",
                children: [
                  e.jsxDEV(
                    re,
                    {
                      className: "bg-gray-900 border-gray-800 mb-6",
                      children: [
                        e.jsxDEV(
                          U,
                          { value: "my-pitches", children: "My Pitches" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                            lineNumber: 267,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          U,
                          { value: "find-curators", children: "Find Curators" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                            lineNumber: 268,
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
                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                      lineNumber: 266,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    R,
                    {
                      value: "my-pitches",
                      className: "space-y-4",
                      children: [
                        !w &&
                          v.length === 0 &&
                          e.jsxDEV(
                            "div",
                            {
                              className:
                                "rounded-xl border border-dashed border-gray-700 bg-gray-900/50 py-14 px-6 text-center space-y-6",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "mx-auto w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center",
                                    children: e.jsxDEV(
                                      L,
                                      { className: "w-7 h-7 text-purple-400" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                        lineNumber: 275,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                    lineNumber: 274,
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
                                        "h3",
                                        {
                                          className:
                                            "text-xl font-semibold text-white",
                                          children:
                                            "Start tracking your pitches",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                          lineNumber: 278,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "text-gray-400 max-w-md mx-auto text-sm leading-relaxed",
                                          children:
                                            "Log every playlist submission you make — accepted, rejected, or still waiting. Build a real picture of what's working.",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                          lineNumber: 279,
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
                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                    lineNumber: 277,
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
                                        step: "1",
                                        text: 'Find a curator in the "Find Curators" tab',
                                      },
                                      {
                                        step: "2",
                                        text: "Submit your music via their submission link",
                                      },
                                      {
                                        step: "3",
                                        text: "Track the pitch here and update its status",
                                      },
                                    ].map((s) =>
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-start gap-3 p-3 rounded-lg bg-gray-800/60 border border-gray-700",
                                          children: [
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5",
                                                children: s.step,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                lineNumber: 290,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-xs text-gray-300",
                                                children: s.text,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                lineNumber: 291,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        s.step,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                          lineNumber: 289,
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
                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                    lineNumber: 283,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  a,
                                  {
                                    onClick: () => u(!0),
                                    className:
                                      "bg-purple-600 hover:bg-purple-700",
                                    children: [
                                      e.jsxDEV(
                                        F,
                                        { className: "w-4 h-4 mr-2" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                          lineNumber: 296,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      "Track Your First Pitch",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                    lineNumber: 295,
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
                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                              lineNumber: 273,
                              columnNumber: 15,
                            },
                            this,
                          ),
                        (w || v.length > 0) &&
                          e.jsxDEV(
                            n,
                            {
                              className: "bg-gray-900 border-gray-800",
                              children: e.jsxDEV(
                                "div",
                                {
                                  className: "overflow-x-auto",
                                  children: e.jsxDEV(
                                    "table",
                                    {
                                      className: "w-full text-left text-sm",
                                      children: [
                                        e.jsxDEV(
                                          "thead",
                                          {
                                            className:
                                              "border-b border-gray-800 text-gray-400 font-medium",
                                            children: e.jsxDEV(
                                              "tr",
                                              {
                                                children: [
                                                  e.jsxDEV(
                                                    "th",
                                                    {
                                                      className: "p-4",
                                                      children: "Track",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                      lineNumber: 307,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "th",
                                                    {
                                                      className: "p-4",
                                                      children: "Curator",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                      lineNumber: 308,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "th",
                                                    {
                                                      className: "p-4",
                                                      children: "Status",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                      lineNumber: 309,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "th",
                                                    {
                                                      className: "p-4",
                                                      children: "Date",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                      lineNumber: 310,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "th",
                                                    {
                                                      className:
                                                        "p-4 text-right",
                                                      children: "Actions",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                      lineNumber: 311,
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
                                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                lineNumber: 306,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                            lineNumber: 305,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "tbody",
                                          {
                                            className:
                                              "divide-y divide-gray-800 text-gray-300",
                                            children: w
                                              ? e.jsxDEV(
                                                  e.Fragment,
                                                  {
                                                    children: [1, 2, 3, 4].map(
                                                      (s) =>
                                                        e.jsxDEV(
                                                          "tr",
                                                          {
                                                            children: [
                                                              e.jsxDEV(
                                                                "td",
                                                                {
                                                                  className:
                                                                    "p-4",
                                                                  children:
                                                                    e.jsxDEV(
                                                                      p,
                                                                      {
                                                                        className:
                                                                          "h-4 w-40",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                        lineNumber: 319,
                                                                        columnNumber: 49,
                                                                      },
                                                                      this,
                                                                    ),
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                  lineNumber: 319,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "td",
                                                                {
                                                                  className:
                                                                    "p-4",
                                                                  children:
                                                                    e.jsxDEV(
                                                                      p,
                                                                      {
                                                                        className:
                                                                          "h-4 w-28",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                        lineNumber: 320,
                                                                        columnNumber: 49,
                                                                      },
                                                                      this,
                                                                    ),
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                  lineNumber: 320,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "td",
                                                                {
                                                                  className:
                                                                    "p-4",
                                                                  children:
                                                                    e.jsxDEV(
                                                                      p,
                                                                      {
                                                                        className:
                                                                          "h-5 w-16 rounded-full",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                        lineNumber: 321,
                                                                        columnNumber: 49,
                                                                      },
                                                                      this,
                                                                    ),
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                  lineNumber: 321,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "td",
                                                                {
                                                                  className:
                                                                    "p-4",
                                                                  children:
                                                                    e.jsxDEV(
                                                                      p,
                                                                      {
                                                                        className:
                                                                          "h-4 w-20",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                        lineNumber: 322,
                                                                        columnNumber: 49,
                                                                      },
                                                                      this,
                                                                    ),
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                  lineNumber: 322,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "td",
                                                                {
                                                                  className:
                                                                    "p-4 text-right",
                                                                  children:
                                                                    e.jsxDEV(
                                                                      p,
                                                                      {
                                                                        className:
                                                                          "h-7 w-14 rounded ml-auto",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                        lineNumber: 323,
                                                                        columnNumber: 60,
                                                                      },
                                                                      this,
                                                                    ),
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                  lineNumber: 323,
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
                                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                            lineNumber: 318,
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
                                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                    lineNumber: 316,
                                                    columnNumber: 23,
                                                  },
                                                  this,
                                                )
                                              : v.map((s) =>
                                                  e.jsxDEV(
                                                    "tr",
                                                    {
                                                      className:
                                                        "hover:bg-gray-800/30 transition-colors",
                                                      children: [
                                                        e.jsxDEV(
                                                          "td",
                                                          {
                                                            className: "p-4",
                                                            children: e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "flex flex-col",
                                                                children: [
                                                                  e.jsxDEV(
                                                                    "span",
                                                                    {
                                                                      className:
                                                                        "font-medium text-white",
                                                                      children:
                                                                        s.trackTitle,
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                      lineNumber: 331,
                                                                      columnNumber: 29,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "span",
                                                                    {
                                                                      className:
                                                                        "text-xs text-gray-500",
                                                                      children:
                                                                        s.artistName,
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                      lineNumber: 332,
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
                                                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                lineNumber: 330,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                            lineNumber: 329,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "td",
                                                          {
                                                            className: "p-4",
                                                            children:
                                                              s.curatorName ||
                                                              "Unknown",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                            lineNumber: 335,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "td",
                                                          {
                                                            className: "p-4",
                                                            children: B(
                                                              s.status,
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                            lineNumber: 336,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "td",
                                                          {
                                                            className:
                                                              "p-4 text-xs",
                                                            children:
                                                              s.submittedAt
                                                                ? new Date(
                                                                    s.submittedAt,
                                                                  ).toLocaleDateString()
                                                                : "Draft",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                            lineNumber: 337,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "td",
                                                          {
                                                            className:
                                                              "p-4 text-right",
                                                            children: e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "flex items-center justify-end gap-2",
                                                                children: [
                                                                  e.jsxDEV(
                                                                    E,
                                                                    {
                                                                      onValueChange:
                                                                        (t) =>
                                                                          H.mutate(
                                                                            {
                                                                              id: s.id,
                                                                              status:
                                                                                t,
                                                                            },
                                                                          ),
                                                                      defaultValue:
                                                                        s.status,
                                                                      children:
                                                                        [
                                                                          e.jsxDEV(
                                                                            V,
                                                                            {
                                                                              className:
                                                                                "w-[130px] h-8 bg-gray-800 border-gray-700",
                                                                              children:
                                                                                e.jsxDEV(
                                                                                  C,
                                                                                  {
                                                                                    placeholder:
                                                                                      "Update Status",
                                                                                  },
                                                                                  void 0,
                                                                                  !1,
                                                                                  {
                                                                                    fileName:
                                                                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                                    lineNumber: 347,
                                                                                    columnNumber: 33,
                                                                                  },
                                                                                  this,
                                                                                ),
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                              lineNumber: 346,
                                                                              columnNumber: 31,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          e.jsxDEV(
                                                                            S,
                                                                            {
                                                                              className:
                                                                                "bg-gray-900 border-gray-800",
                                                                              children:
                                                                                [
                                                                                  e.jsxDEV(
                                                                                    l,
                                                                                    {
                                                                                      value:
                                                                                        "draft",
                                                                                      children:
                                                                                        "Draft",
                                                                                    },
                                                                                    void 0,
                                                                                    !1,
                                                                                    {
                                                                                      fileName:
                                                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                                      lineNumber: 350,
                                                                                      columnNumber: 33,
                                                                                    },
                                                                                    this,
                                                                                  ),
                                                                                  e.jsxDEV(
                                                                                    l,
                                                                                    {
                                                                                      value:
                                                                                        "submitted",
                                                                                      children:
                                                                                        "Submitted",
                                                                                    },
                                                                                    void 0,
                                                                                    !1,
                                                                                    {
                                                                                      fileName:
                                                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                                      lineNumber: 351,
                                                                                      columnNumber: 33,
                                                                                    },
                                                                                    this,
                                                                                  ),
                                                                                  e.jsxDEV(
                                                                                    l,
                                                                                    {
                                                                                      value:
                                                                                        "under_review",
                                                                                      children:
                                                                                        "Under Review",
                                                                                    },
                                                                                    void 0,
                                                                                    !1,
                                                                                    {
                                                                                      fileName:
                                                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                                      lineNumber: 352,
                                                                                      columnNumber: 33,
                                                                                    },
                                                                                    this,
                                                                                  ),
                                                                                  e.jsxDEV(
                                                                                    l,
                                                                                    {
                                                                                      value:
                                                                                        "accepted",
                                                                                      children:
                                                                                        "Accepted",
                                                                                    },
                                                                                    void 0,
                                                                                    !1,
                                                                                    {
                                                                                      fileName:
                                                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                                      lineNumber: 353,
                                                                                      columnNumber: 33,
                                                                                    },
                                                                                    this,
                                                                                  ),
                                                                                  e.jsxDEV(
                                                                                    l,
                                                                                    {
                                                                                      value:
                                                                                        "rejected",
                                                                                      children:
                                                                                        "Rejected",
                                                                                    },
                                                                                    void 0,
                                                                                    !1,
                                                                                    {
                                                                                      fileName:
                                                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                                      lineNumber: 354,
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
                                                                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                              lineNumber: 349,
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
                                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                      lineNumber: 342,
                                                                      columnNumber: 29,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    a,
                                                                    {
                                                                      variant:
                                                                        "ghost",
                                                                      size: "icon",
                                                                      className:
                                                                        "h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                                                                      onClick:
                                                                        () =>
                                                                          y(
                                                                            s.id,
                                                                          ),
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
                                                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                            lineNumber: 363,
                                                                            columnNumber: 31,
                                                                          },
                                                                          this,
                                                                        ),
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                      lineNumber: 357,
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
                                                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                lineNumber: 341,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                            lineNumber: 340,
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
                                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                      lineNumber: 328,
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
                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                            lineNumber: 314,
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
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 304,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                  lineNumber: 303,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                              lineNumber: 302,
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
                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                      lineNumber: 271,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    R,
                    {
                      value: "find-curators",
                      className: "space-y-6",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className:
                              "flex flex-col md:flex-row gap-4 items-center",
                            children: [
                              e.jsxDEV(
                                "div",
                                {
                                  className: "relative flex-1 w-full",
                                  children: [
                                    e.jsxDEV(
                                      X,
                                      {
                                        className:
                                          "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                        lineNumber: 379,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      h,
                                      {
                                        placeholder:
                                          "Search by curator or genre...",
                                        className:
                                          "pl-10 bg-gray-900 border-gray-800 text-white",
                                        value: x,
                                        onChange: (s) => K(s.target.value),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                        lineNumber: 380,
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
                                    "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                  lineNumber: 378,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "flex items-center gap-2 w-full md:w-auto",
                                  children: [
                                    e.jsxDEV(
                                      z,
                                      { className: "w-4 h-4 text-gray-500" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                        lineNumber: 388,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      E,
                                      {
                                        value: f,
                                        onValueChange: Q,
                                        children: [
                                          e.jsxDEV(
                                            V,
                                            {
                                              className:
                                                "w-full md:w-[180px] bg-gray-900 border-gray-800",
                                              children: e.jsxDEV(
                                                C,
                                                { placeholder: "Genre" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                  lineNumber: 391,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                              lineNumber: 390,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            S,
                                            {
                                              className:
                                                "bg-gray-900 border-gray-800",
                                              children: [
                                                e.jsxDEV(
                                                  l,
                                                  {
                                                    value: "all",
                                                    children: "All Genres",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                    lineNumber: 394,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  l,
                                                  {
                                                    value: "pop",
                                                    children: "Pop",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                    lineNumber: 395,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  l,
                                                  {
                                                    value: "indie",
                                                    children: "Indie",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                    lineNumber: 396,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  l,
                                                  {
                                                    value: "electronic",
                                                    children: "Electronic",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                    lineNumber: 397,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  l,
                                                  {
                                                    value: "hip-hop",
                                                    children: "Hip-Hop",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                    lineNumber: 398,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  l,
                                                  {
                                                    value: "lofi",
                                                    children: "Lofi",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                    lineNumber: 399,
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
                                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
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
                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                        lineNumber: 389,
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
                                    "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                  lineNumber: 387,
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
                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                            lineNumber: 377,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className:
                              "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
                            children: M
                              ? Array(6)
                                  .fill(0)
                                  .map((s, t) =>
                                    e.jsxDEV(
                                      n,
                                      {
                                        className:
                                          "bg-gray-900 border-gray-800 h-48 animate-pulse",
                                      },
                                      t,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                        lineNumber: 408,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  )
                              : A.length === 0
                                ? e.jsxDEV(
                                    "div",
                                    {
                                      className:
                                        "col-span-full py-14 text-center border border-dashed border-gray-700 rounded-xl bg-gray-900/50 space-y-3",
                                      children: [
                                        e.jsxDEV(
                                          Z,
                                          {
                                            className:
                                              "mx-auto w-10 h-10 text-gray-600",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                            lineNumber: 412,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "p",
                                          {
                                            className:
                                              "text-gray-400 font-medium",
                                            children: "No curators found",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                            lineNumber: 413,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "p",
                                          {
                                            className: "text-sm text-gray-600",
                                            children:
                                              "Try a different genre filter or search term.",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                            lineNumber: 414,
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
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 411,
                                      columnNumber: 17,
                                    },
                                    this,
                                  )
                                : A.map((s) =>
                                    e.jsxDEV(
                                      n,
                                      {
                                        className:
                                          "bg-gray-900 border-gray-800 hover:border-purple-500/50 transition-all group",
                                        children: [
                                          e.jsxDEV(
                                            te,
                                            {
                                              className: "pb-2",
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
                                                            ae,
                                                            {
                                                              className:
                                                                "text-lg text-white group-hover:text-purple-400 transition-colors",
                                                              children: s.name,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                              lineNumber: 421,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "p",
                                                            {
                                                              className:
                                                                "text-sm text-gray-500 mt-1",
                                                              children: s.genre,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                              lineNumber: 424,
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
                                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                        lineNumber: 420,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      c,
                                                      {
                                                        variant: "secondary",
                                                        className:
                                                          "bg-purple-500/10 text-purple-400",
                                                        children: s.followers,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                        lineNumber: 426,
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
                                                    "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                  lineNumber: 419,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                              lineNumber: 418,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            g,
                                            {
                                              className: "space-y-4",
                                              children: [
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "flex flex-col gap-1 text-xs text-gray-400",
                                                    children: e.jsxDEV(
                                                      "span",
                                                      { children: s.email },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                        lineNumber: 433,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                    lineNumber: 432,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "flex gap-2",
                                                    children: [
                                                      e.jsxDEV(
                                                        a,
                                                        {
                                                          asChild: !0,
                                                          variant: "outline",
                                                          className:
                                                            "flex-1 bg-gray-800 border-gray-700 h-9 text-xs",
                                                          children: e.jsxDEV(
                                                            "a",
                                                            {
                                                              href: s.submissionUrl,
                                                              target: "_blank",
                                                              rel: "noopener noreferrer",
                                                              children: [
                                                                e.jsxDEV(
                                                                  J,
                                                                  {
                                                                    className:
                                                                      "w-3 h-3 mr-2",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                                    lineNumber: 438,
                                                                    columnNumber: 27,
                                                                  },
                                                                  this,
                                                                ),
                                                                "Submit Music",
                                                              ],
                                                            },
                                                            void 0,
                                                            !0,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                              lineNumber: 437,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                          lineNumber: 436,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        a,
                                                        {
                                                          onClick: () => {
                                                            (r((t) => ({
                                                              ...t,
                                                              curatorName:
                                                                s.name,
                                                              playlistUrl:
                                                                s.submissionUrl,
                                                            })),
                                                              u(!0));
                                                          },
                                                          className:
                                                            "flex-1 bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 h-9 text-xs",
                                                          children:
                                                            "Track Pitch",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                          lineNumber: 442,
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
                                                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                    lineNumber: 435,
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
                                                "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                              lineNumber: 431,
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
                                          "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                        lineNumber: 417,
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
                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                            lineNumber: 405,
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
                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                      lineNumber: 376,
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
                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                lineNumber: 265,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              ne,
              {
                open: q,
                onOpenChange: u,
                children: e.jsxDEV(
                  ce,
                  {
                    className:
                      "bg-gray-900 border-gray-800 text-white sm:max-w-[600px]",
                    children: [
                      e.jsxDEV(
                        me,
                        {
                          children: [
                            e.jsxDEV(
                              oe,
                              { children: "Track New Playlist Pitch" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 467,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              ue,
                              {
                                className: "text-gray-400",
                                children:
                                  "Record a pitch you've made to track its status and follow-ups.",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 468,
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
                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                          lineNumber: 466,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "div",
                        {
                          className: "grid grid-cols-2 gap-4 py-4",
                          children: [
                            e.jsxDEV(
                              "div",
                              {
                                className: "space-y-2",
                                children: [
                                  e.jsxDEV(
                                    m,
                                    {
                                      htmlFor: "trackTitle",
                                      children: "Track Title",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 475,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    h,
                                    {
                                      id: "trackTitle",
                                      placeholder: "e.g. Midnight Waves",
                                      className: "bg-gray-800 border-gray-700",
                                      value: i.trackTitle,
                                      onChange: (s) =>
                                        r({ ...i, trackTitle: s.target.value }),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 476,
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
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 474,
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
                                    m,
                                    {
                                      htmlFor: "artistName",
                                      children: "Artist Name",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 485,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    h,
                                    {
                                      id: "artistName",
                                      placeholder: "Your artist name",
                                      className: "bg-gray-800 border-gray-700",
                                      value: i.artistName,
                                      onChange: (s) =>
                                        r({ ...i, artistName: s.target.value }),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 486,
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
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 484,
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
                                    m,
                                    { htmlFor: "genre", children: "Genre" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 495,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    h,
                                    {
                                      id: "genre",
                                      placeholder: "e.g. Dream Pop",
                                      className: "bg-gray-800 border-gray-700",
                                      value: i.genre,
                                      onChange: (s) =>
                                        r({ ...i, genre: s.target.value }),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 496,
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
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 494,
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
                                    m,
                                    {
                                      htmlFor: "status",
                                      children: "Current Status",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 505,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    E,
                                    {
                                      value: i.status,
                                      onValueChange: (s) =>
                                        r({ ...i, status: s }),
                                      children: [
                                        e.jsxDEV(
                                          V,
                                          {
                                            className:
                                              "bg-gray-800 border-gray-700",
                                            children: e.jsxDEV(
                                              C,
                                              {},
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                lineNumber: 511,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                            lineNumber: 510,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          S,
                                          {
                                            className:
                                              "bg-gray-900 border-gray-800",
                                            children: [
                                              e.jsxDEV(
                                                l,
                                                {
                                                  value: "draft",
                                                  children: "Draft",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                  lineNumber: 514,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                l,
                                                {
                                                  value: "submitted",
                                                  children: "Submitted",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                  lineNumber: 515,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                l,
                                                {
                                                  value: "under_review",
                                                  children: "Under Review",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                                  lineNumber: 516,
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
                                              "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                            lineNumber: 513,
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
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 506,
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
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 504,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "space-y-2 col-span-2",
                                children: [
                                  e.jsxDEV(
                                    m,
                                    {
                                      htmlFor: "curatorName",
                                      children: "Curator / Playlist Name",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 521,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    h,
                                    {
                                      id: "curatorName",
                                      placeholder: "e.g. Indie Mono",
                                      className: "bg-gray-800 border-gray-700",
                                      value: i.curatorName,
                                      onChange: (s) =>
                                        r({
                                          ...i,
                                          curatorName: s.target.value,
                                        }),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 522,
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
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 520,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "space-y-2 col-span-2",
                                children: [
                                  e.jsxDEV(
                                    m,
                                    {
                                      htmlFor: "playlistUrl",
                                      children: "Playlist / Submission URL",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 531,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    h,
                                    {
                                      id: "playlistUrl",
                                      placeholder: "https://...",
                                      className: "bg-gray-800 border-gray-700",
                                      value: i.playlistUrl,
                                      onChange: (s) =>
                                        r({
                                          ...i,
                                          playlistUrl: s.target.value,
                                        }),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
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
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 530,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "space-y-2 col-span-2",
                                children: [
                                  e.jsxDEV(
                                    m,
                                    {
                                      htmlFor: "description",
                                      children: "Pitch Description",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 541,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    he,
                                    {
                                      id: "description",
                                      placeholder:
                                        "Tell the curator about your track...",
                                      className:
                                        "bg-gray-800 border-gray-700 h-24",
                                      value: i.description,
                                      onChange: (s) =>
                                        r({
                                          ...i,
                                          description: s.target.value,
                                        }),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                      lineNumber: 542,
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
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 540,
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
                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                          lineNumber: 473,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        Ne,
                        {
                          children: [
                            e.jsxDEV(
                              a,
                              {
                                variant: "outline",
                                onClick: () => u(!1),
                                className: "bg-gray-800 border-gray-700",
                                children: "Cancel",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 553,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              a,
                              {
                                onClick: () =>
                                  k.mutate({
                                    ...i,
                                    submittedAt: new Date().toISOString(),
                                  }),
                                className: "bg-purple-600 hover:bg-purple-700",
                                disabled: k.isPending,
                                children: k.isPending
                                  ? "Saving..."
                                  : "Save Pitch",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 556,
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
                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                          lineNumber: 552,
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
                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                    lineNumber: 465,
                    columnNumber: 11,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                lineNumber: 464,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              de,
              {
                open: !!P,
                onOpenChange: (s) => {
                  s || y(null);
                },
                children: e.jsxDEV(
                  ge,
                  {
                    children: [
                      e.jsxDEV(
                        pe,
                        {
                          children: [
                            e.jsxDEV(
                              be,
                              { children: "Delete Pitch" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 571,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              xe,
                              {
                                children:
                                  "Are you sure you want to delete this pitch? This action cannot be undone.",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 572,
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
                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                          lineNumber: 570,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        fe,
                        {
                          children: [
                            e.jsxDEV(
                              Pe,
                              { children: "Cancel" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 577,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              ye,
                              {
                                className:
                                  "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                                onClick: () => {
                                  P && (O.mutate(P), y(null));
                                },
                                children: "Delete Pitch",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                                lineNumber: 578,
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
                            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                          lineNumber: 576,
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
                      "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                    lineNumber: 569,
                    columnNumber: 11,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
                lineNumber: 568,
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
            "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
          lineNumber: 191,
          columnNumber: 7,
        },
        this,
      ),
    },
    void 0,
    !1,
    {
      fileName: "/home/runner/workspace/client/src/pages/PlaylistPitching.tsx",
      lineNumber: 190,
      columnNumber: 5,
    },
    this,
  );
}
export { Fe as default };
