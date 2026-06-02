import {
  ag as we,
  r as l,
  ah as ie,
  aH as te,
  aI as $,
  f as e,
  al as Pe,
  aO as U,
  aW as H,
  aY as ke,
  am as J,
  dk as Ee,
  ca as De,
  ap as O,
  be as Z,
  bf as q,
  d7 as Ve,
  b9 as ee,
  bu as ye,
  a_ as Ce,
  ai as Se,
  bE as Te,
  b0 as Me,
  b2 as Le,
  N as $e,
} from "./vendor-react-31oK5L0i.js";
import { a as Fe } from "./useRequireAuth-K5x5riUd.js";
import { A as Ie } from "./AppLayout-D2pri0rw.js";
import {
  u as ne,
  j as o,
  ah as Re,
  o as ae,
  p as le,
  r as ce,
  v as oe,
  L as h,
  I as D,
  y as G,
  W as me,
  X as ue,
  Y as de,
  Z as Ne,
  $ as u,
  a4 as Oe,
  a5 as ze,
  a6 as se,
  a9 as re,
  C as j,
  h as L,
  a0 as Ae,
  a1 as Ue,
  a2 as qe,
  a3 as M,
  a7 as Be,
  B as W,
  P as Ke,
  a as V,
  ae as Qe,
  a8 as B,
  d as K,
  f as Q,
} from "./studio-DOUfHW5v.js";
import { E as He } from "./empty-state-DfwunVY4.js";
import { c as Ge } from "./skeleton-loader-CDQdh215.js";
import { u as We } from "./useAnalyticsInvalidation-CDL60uwj.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./index-D5xLbTBZ.js";
import "./vendor-animation-CFQslDag.js";
import "./TopBar-jcH3P98k.js";
function os() {
  const { user: y, isLoading: C } = Fe(),
    [n, c] = we(),
    [z, F] = l.useState("projects"),
    [S, T] = l.useState(!1),
    [x, g] = l.useState(null),
    [v, p] = l.useState(null),
    t = l.useRef(null),
    a = l.useRef(null),
    [I, P] = l.useState(!1),
    [k, E] = l.useState(null),
    [b, w] = l.useState({ title: "", description: "", genre: "" }),
    { toast: d } = ne(),
    r = ie(),
    { invalidateOnProjectChange: m } = We(),
    { data: Y, isLoading: he } = te({
      queryKey: ["/api/projects"],
      enabled: !!y,
    }),
    R = Y?.data || [],
    pe = $({
      mutationFn: async (s) =>
        (await V("DELETE", `/api/studio/projects/${s}`)).json(),
      onSuccess: () => {
        (r.invalidateQueries({ queryKey: ["/api/projects"] }),
          r.invalidateQueries({ queryKey: ["/api/studio/projects"] }),
          r.invalidateQueries({ queryKey: ["/api/studio/start-hub/summary"] }),
          m(),
          d({
            title: "Project Deleted",
            description: "The project has been removed successfully.",
          }));
      },
      onError: (s) => {
        d({
          title: "Delete Failed",
          description:
            s.message || "Failed to delete project. Please try again.",
          variant: "destructive",
        });
      },
    }),
    A = $({
      mutationFn: async ({ id: s, data: i }) =>
        (await V("PATCH", `/api/studio/projects/${s}`, i)).json(),
      onSuccess: () => {
        (r.invalidateQueries({ queryKey: ["/api/projects"] }),
          r.invalidateQueries({ queryKey: ["/api/studio/projects"] }),
          r.invalidateQueries({ queryKey: ["/api/studio/start-hub/summary"] }),
          m(),
          d({
            title: "Project Updated",
            description: "Your project has been updated successfully.",
          }),
          P(!1),
          E(null));
      },
      onError: (s) => {
        d({
          title: "Update Failed",
          description: s.message || "Failed to update project.",
          variant: "destructive",
        });
      },
    });
  l.useEffect(
    () => () => {
      t.current &&
        (t.current.pause(), (t.current.src = ""), (t.current = null));
    },
    [],
  );
  const _ = (s) => {
      if (x === s.id && t.current) {
        (t.current.pause(), g(null), p(null), (a.current = null));
        return;
      }
      if ((t.current && t.current.pause(), s.audioUrl)) {
        let i = s.audioUrl;
        (!i.startsWith("http") &&
          !i.startsWith("/api/") &&
          (i = `/api/marketplace/audio/${i.replace(/^\//, "")}`),
          (a.current = s.id),
          p(s.id),
          g(s.id));
        const f = (N) => {
          ((N.oncanplay = () => {
            (a.current === s.id && p(null), (N.oncanplay = null));
          }),
            (N.onended = () => {
              a.current === s.id && (g(null), p(null), (a.current = null));
            }),
            (N.onerror = () => {
              a.current === s.id &&
                (g(null),
                p(null),
                (a.current = null),
                d({
                  title: "Playback Error",
                  description: "Could not load audio file.",
                  variant: "destructive",
                }));
            }),
            N.play().catch(() => {
              a.current === s.id && (g(null), p(null), (a.current = null));
            }));
        };
        if (t.current && t.current.src.endsWith(i))
          (p(null),
            (t.current.currentTime = 0),
            t.current.play().catch(() => {
              (g(null), (a.current = null));
            }));
        else {
          const N = t.current || new Audio();
          ((N.preload = "auto"), (N.src = i), (t.current = N), f(N));
        }
      } else
        d({
          title: "No Audio File",
          description: "This project doesn't have an audio file attached.",
          variant: "destructive",
        });
    },
    be = (s) => {
      (E(s),
        w({
          title: s.title || "",
          description: s.description || "",
          genre: s.genre || "",
        }),
        P(!0));
    },
    xe = async (s) => {
      if ((s.preventDefault(), !b.title.trim())) {
        d({
          title: "Missing Information",
          description: "Please provide a title.",
          variant: "destructive",
        });
        return;
      }
      if (!k) {
        d({
          title: "Error",
          description: "No project selected for editing.",
          variant: "destructive",
        });
        return;
      }
      A.mutate({
        id: k.id,
        data: { title: b.title, description: b.description, genre: b.genre },
      });
    },
    ge = (s) =>
      ({
        setup: "SETUP",
        recording: "RECORDING",
        editing: "EDITING",
        mixing: "MIXING",
        mastering: "MASTERING",
        delivery: "DELIVERY",
      })[s] ||
      s?.toUpperCase() ||
      "DRAFT",
    fe = (s) => {
      switch (s) {
        case "delivery":
          return "bg-green-100 text-green-800 border-green-200";
        case "mastering":
          return "bg-purple-100 text-purple-800 border-purple-200";
        case "mixing":
          return "bg-indigo-100 text-indigo-800 border-indigo-200";
        case "editing":
          return "bg-blue-100 text-blue-800 border-blue-200";
        case "recording":
          return "bg-cyan-100 text-cyan-800 border-cyan-200";
        default:
          return "bg-gray-100 text-gray-800 border-gray-200";
      }
    },
    X = (s, i) =>
      i ||
      {
        setup: 10,
        recording: 25,
        editing: 45,
        mixing: 65,
        mastering: 85,
        delivery: 100,
      }[s] ||
      10,
    je = (s) => {
      const i = ["Bytes", "KB", "MB", "GB"];
      if (s === 0) return "0 Bytes";
      const f = Math.floor(Math.log(s) / Math.log(1024));
      return Math.round((s / Math.pow(1024, f)) * 100) / 100 + " " + i[f];
    },
    ve = (s) => {
      const i = Math.floor(s / 60),
        f = Math.floor(s % 60);
      return `${i}:${f.toString().padStart(2, "0")}`;
    };
  return C
    ? e.jsxDEV(
        "div",
        {
          className: "min-h-screen flex items-center justify-center",
          children: e.jsxDEV(
            "div",
            {
              className:
                "animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full",
            },
            void 0,
            !1,
            {
              fileName: "/home/runner/workspace/client/src/pages/Projects.tsx",
              lineNumber: 376,
              columnNumber: 9,
            },
            this,
          ),
        },
        void 0,
        !1,
        {
          fileName: "/home/runner/workspace/client/src/pages/Projects.tsx",
          lineNumber: 375,
          columnNumber: 7,
        },
        this,
      )
    : e.jsxDEV(
        Ie,
        {
          children: e.jsxDEV(
            "div",
            {
              className: "p-6",
              role: "main",
              "aria-label": "Projects management",
              children: [
                e.jsxDEV(
                  "header",
                  {
                    className: "flex justify-between items-center mb-6",
                    role: "banner",
                    children: [
                      e.jsxDEV(
                        "div",
                        {
                          children: [
                            e.jsxDEV(
                              "h1",
                              {
                                className: "text-2xl font-bold text-gray-900",
                                children: "Your Projects",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                lineNumber: 387,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "p",
                              {
                                className: "text-gray-500",
                                role: "status",
                                "aria-live": "polite",
                                children: [
                                  R.length,
                                  " project",
                                  R.length !== 1 ? "s" : "",
                                  " total",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                lineNumber: 388,
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
                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                          lineNumber: 386,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "div",
                        {
                          className: "flex gap-2",
                          children: [
                            e.jsxDEV(
                              o,
                              {
                                className: "gradient-bg",
                                "data-testid": "button-upload-project",
                                "aria-label": "New project",
                                onClick: () => T(!0),
                                children: [
                                  e.jsxDEV(
                                    Pe,
                                    {
                                      className: "h-4 w-4 mr-2",
                                      "aria-hidden": "true",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                      lineNumber: 401,
                                      columnNumber: 15,
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
                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                lineNumber: 395,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              Re,
                              {
                                open: S,
                                onOpenChange: T,
                                onProjectCreated: () => {
                                  m();
                                },
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
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
                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                          lineNumber: 394,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        ae,
                        {
                          open: I,
                          onOpenChange: P,
                          children: e.jsxDEV(
                            le,
                            {
                              className: "max-w-md",
                              children: [
                                e.jsxDEV(
                                  ce,
                                  {
                                    children: e.jsxDEV(
                                      oe,
                                      { children: "Edit Project" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Projects.tsx",
                                        lineNumber: 418,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                    lineNumber: 417,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "form",
                                  {
                                    onSubmit: xe,
                                    className: "space-y-4",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          children: [
                                            e.jsxDEV(
                                              h,
                                              {
                                                htmlFor: "edit-title",
                                                children: "Project Title",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 423,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              D,
                                              {
                                                id: "edit-title",
                                                value: b.title,
                                                onChange: (s) =>
                                                  w((i) => ({
                                                    ...i,
                                                    title: s.target.value,
                                                  })),
                                                placeholder:
                                                  "Enter project title",
                                                required: !0,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 424,
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
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 422,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          children: [
                                            e.jsxDEV(
                                              h,
                                              {
                                                htmlFor: "edit-description",
                                                children:
                                                  "Description (Optional)",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 434,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              G,
                                              {
                                                id: "edit-description",
                                                value: b.description,
                                                onChange: (s) =>
                                                  w((i) => ({
                                                    ...i,
                                                    description: s.target.value,
                                                  })),
                                                placeholder:
                                                  "Describe your project",
                                                rows: 3,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 435,
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
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 433,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          children: [
                                            e.jsxDEV(
                                              h,
                                              {
                                                htmlFor: "edit-genre",
                                                children: "Genre",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 447,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              me,
                                              {
                                                value: b.genre,
                                                onValueChange: (s) =>
                                                  w((i) => ({
                                                    ...i,
                                                    genre: s,
                                                  })),
                                                children: [
                                                  e.jsxDEV(
                                                    ue,
                                                    {
                                                      children: e.jsxDEV(
                                                        de,
                                                        {
                                                          placeholder:
                                                            "Select genre",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                          lineNumber: 453,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                      lineNumber: 452,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    Ne,
                                                    {
                                                      children: [
                                                        e.jsxDEV(
                                                          u,
                                                          {
                                                            value: "pop",
                                                            children: "Pop",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 456,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          u,
                                                          {
                                                            value: "rock",
                                                            children: "Rock",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 457,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          u,
                                                          {
                                                            value: "hip-hop",
                                                            children: "Hip-Hop",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 458,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          u,
                                                          {
                                                            value: "electronic",
                                                            children:
                                                              "Electronic",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 459,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          u,
                                                          {
                                                            value: "jazz",
                                                            children: "Jazz",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 460,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          u,
                                                          {
                                                            value: "classical",
                                                            children:
                                                              "Classical",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 461,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          u,
                                                          {
                                                            value: "country",
                                                            children: "Country",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 462,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          u,
                                                          {
                                                            value: "r&b",
                                                            children: "R&B",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 463,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          u,
                                                          {
                                                            value: "indie",
                                                            children: "Indie",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 464,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          u,
                                                          {
                                                            value: "other",
                                                            children: "Other",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 465,
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
                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                      lineNumber: 455,
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
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 448,
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
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 446,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex justify-end space-x-2 pt-4",
                                          children: [
                                            e.jsxDEV(
                                              o,
                                              {
                                                type: "button",
                                                variant: "outline",
                                                onClick: () => P(!1),
                                                children: "Cancel",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 471,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              o,
                                              {
                                                type: "submit",
                                                disabled: A.isPending,
                                                children: A.isPending
                                                  ? "Updating..."
                                                  : "Update Project",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 474,
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
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 470,
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
                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                    lineNumber: 421,
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
                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                              lineNumber: 416,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                          lineNumber: 415,
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
                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                    lineNumber: 385,
                    columnNumber: 9,
                  },
                  this,
                ),
                e.jsxDEV(
                  Oe,
                  {
                    value: z,
                    onValueChange: F,
                    className: "space-y-4 mt-2",
                    children: [
                      e.jsxDEV(
                        ze,
                        {
                          className:
                            "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
                          children: [
                            e.jsxDEV(
                              se,
                              {
                                value: "projects",
                                className:
                                  "data-[state=active]:bg-blue-600 data-[state=active]:text-white",
                                children: [
                                  e.jsxDEV(
                                    U,
                                    { className: "w-4 h-4 mr-1" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                      lineNumber: 486,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  "My Projects",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                lineNumber: 485,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              se,
                              {
                                value: "songwriting",
                                className:
                                  "data-[state=active]:bg-blue-600 data-[state=active]:text-white",
                                children: [
                                  e.jsxDEV(
                                    H,
                                    { className: "w-4 h-4 mr-1" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                      lineNumber: 490,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  "Songwriting",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                lineNumber: 489,
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
                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                          lineNumber: 484,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        re,
                        {
                          value: "projects",
                          className: "space-y-6",
                          children: he
                            ? e.jsxDEV(
                                "section",
                                {
                                  className:
                                    "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
                                  role: "region",
                                  "aria-label": "Loading projects",
                                  "aria-busy": "true",
                                  children: [...Array(6)].map((s, i) =>
                                    e.jsxDEV(
                                      Ge,
                                      {},
                                      i,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Projects.tsx",
                                        lineNumber: 505,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Projects.tsx",
                                  lineNumber: 498,
                                  columnNumber: 11,
                                },
                                this,
                              )
                            : R.length === 0
                              ? e.jsxDEV(
                                  He,
                                  {
                                    icon: ke,
                                    title:
                                      "No projects yet. Create your first masterpiece!",
                                    description:
                                      "Upload your first audio to get started with AI-powered music tools.",
                                    actionLabel: "Upload Project",
                                    onAction: () => T(!0),
                                    size: "lg",
                                    variant: "card",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                    lineNumber: 509,
                                    columnNumber: 11,
                                  },
                                  this,
                                )
                              : e.jsxDEV(
                                  "section",
                                  {
                                    className:
                                      "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
                                    role: "region",
                                    "aria-label": "Projects grid",
                                    children: R.map((s) =>
                                      e.jsxDEV(
                                        j,
                                        {
                                          className:
                                            "hover:shadow-lg transition-shadow duration-200 cursor-pointer",
                                          onClick: () => c(`/studio/${s.id}`),
                                          children: e.jsxDEV(
                                            L,
                                            {
                                              className: "p-6",
                                              children: [
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "flex items-start justify-between mb-4",
                                                    children: [
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "flex items-center space-x-3 flex-1 min-w-0",
                                                          children: [
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "w-12 h-12 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0",
                                                                children:
                                                                  e.jsxDEV(
                                                                    J,
                                                                    {
                                                                      className:
                                                                        "h-6 w-6 text-white",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                      lineNumber: 531,
                                                                      columnNumber: 25,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                lineNumber: 530,
                                                                columnNumber: 23,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "min-w-0 flex-1",
                                                                children: [
                                                                  e.jsxDEV(
                                                                    "h3",
                                                                    {
                                                                      className:
                                                                        "font-semibold text-gray-900 truncate",
                                                                      children:
                                                                        s.title,
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                      lineNumber: 534,
                                                                      columnNumber: 25,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "p",
                                                                    {
                                                                      className:
                                                                        "text-sm text-gray-500",
                                                                      children:
                                                                        [
                                                                          s.genre &&
                                                                            e.jsxDEV(
                                                                              "span",
                                                                              {
                                                                                className:
                                                                                  "capitalize",
                                                                                children:
                                                                                  [
                                                                                    s.genre,
                                                                                    " • ",
                                                                                  ],
                                                                              },
                                                                              void 0,
                                                                              !0,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                                lineNumber: 536,
                                                                                columnNumber: 45,
                                                                              },
                                                                              this,
                                                                            ),
                                                                          e.jsxDEV(
                                                                            Ee,
                                                                            {
                                                                              className:
                                                                                "inline h-3 w-3 mr-1",
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                              lineNumber: 537,
                                                                              columnNumber: 27,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          new Date(
                                                                            s.createdAt,
                                                                          ).toLocaleDateString(),
                                                                        ],
                                                                    },
                                                                    void 0,
                                                                    !0,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                      lineNumber: 535,
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
                                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                lineNumber: 533,
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
                                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                          lineNumber: 529,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        Ae,
                                                        {
                                                          children: [
                                                            e.jsxDEV(
                                                              Ue,
                                                              {
                                                                asChild: !0,
                                                                children:
                                                                  e.jsxDEV(
                                                                    o,
                                                                    {
                                                                      variant:
                                                                        "ghost",
                                                                      size: "sm",
                                                                      "data-testid": `button-menu-${s.id}`,
                                                                      onClick: (
                                                                        i,
                                                                      ) =>
                                                                        i.stopPropagation(),
                                                                      children:
                                                                        e.jsxDEV(
                                                                          De,
                                                                          {
                                                                            className:
                                                                              "h-4 w-4",
                                                                          },
                                                                          void 0,
                                                                          !1,
                                                                          {
                                                                            fileName:
                                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                            lineNumber: 546,
                                                                            columnNumber: 27,
                                                                          },
                                                                          this,
                                                                        ),
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                      lineNumber: 545,
                                                                      columnNumber: 25,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                lineNumber: 544,
                                                                columnNumber: 23,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              qe,
                                                              {
                                                                align: "end",
                                                                children: [
                                                                  e.jsxDEV(
                                                                    M,
                                                                    {
                                                                      onClick:
                                                                        () =>
                                                                          _(s),
                                                                      "data-testid": `button-play-${s.id}`,
                                                                      children:
                                                                        [
                                                                          v ===
                                                                          s.id
                                                                            ? e.jsxDEV(
                                                                                O,
                                                                                {
                                                                                  className:
                                                                                    "h-4 w-4 mr-2 animate-spin",
                                                                                },
                                                                                void 0,
                                                                                !1,
                                                                                {
                                                                                  fileName:
                                                                                    "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                                  lineNumber: 555,
                                                                                  columnNumber: 29,
                                                                                },
                                                                                this,
                                                                              )
                                                                            : x ===
                                                                                s.id
                                                                              ? e.jsxDEV(
                                                                                  Z,
                                                                                  {
                                                                                    className:
                                                                                      "h-4 w-4 mr-2",
                                                                                  },
                                                                                  void 0,
                                                                                  !1,
                                                                                  {
                                                                                    fileName:
                                                                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                                    lineNumber: 557,
                                                                                    columnNumber: 29,
                                                                                  },
                                                                                  this,
                                                                                )
                                                                              : e.jsxDEV(
                                                                                  q,
                                                                                  {
                                                                                    className:
                                                                                      "h-4 w-4 mr-2",
                                                                                  },
                                                                                  void 0,
                                                                                  !1,
                                                                                  {
                                                                                    fileName:
                                                                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                                    lineNumber: 559,
                                                                                    columnNumber: 29,
                                                                                  },
                                                                                  this,
                                                                                ),
                                                                          v ===
                                                                          s.id
                                                                            ? "Buffering…"
                                                                            : x ===
                                                                                s.id
                                                                              ? "Pause"
                                                                              : "Play",
                                                                        ],
                                                                    },
                                                                    void 0,
                                                                    !0,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                      lineNumber: 550,
                                                                      columnNumber: 25,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    M,
                                                                    {
                                                                      onClick:
                                                                        () =>
                                                                          c(
                                                                            `/studio/${s.id}`,
                                                                          ),
                                                                      "data-testid": `button-open-studio-${s.id}`,
                                                                      children:
                                                                        [
                                                                          e.jsxDEV(
                                                                            U,
                                                                            {
                                                                              className:
                                                                                "h-4 w-4 mr-2",
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                              lineNumber: 567,
                                                                              columnNumber: 27,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          "Open in Studio",
                                                                        ],
                                                                    },
                                                                    void 0,
                                                                    !0,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                      lineNumber: 563,
                                                                      columnNumber: 25,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    M,
                                                                    {
                                                                      onClick:
                                                                        () =>
                                                                          be(s),
                                                                      "data-testid": `button-edit-${s.id}`,
                                                                      children:
                                                                        [
                                                                          e.jsxDEV(
                                                                            Ve,
                                                                            {
                                                                              className:
                                                                                "h-4 w-4 mr-2",
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                              lineNumber: 574,
                                                                              columnNumber: 27,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          "Edit Details",
                                                                        ],
                                                                    },
                                                                    void 0,
                                                                    !0,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                      lineNumber: 570,
                                                                      columnNumber: 25,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    M,
                                                                    {
                                                                      onClick:
                                                                        () =>
                                                                          c(
                                                                            `/analytics?project=${s.id}`,
                                                                          ),
                                                                      "data-testid": `button-analytics-${s.id}`,
                                                                      children:
                                                                        [
                                                                          e.jsxDEV(
                                                                            ee,
                                                                            {
                                                                              className:
                                                                                "h-4 w-4 mr-2",
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                              lineNumber: 581,
                                                                              columnNumber: 27,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          "Analytics",
                                                                        ],
                                                                    },
                                                                    void 0,
                                                                    !0,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                      lineNumber: 577,
                                                                      columnNumber: 25,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    Be,
                                                                    {},
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                      lineNumber: 584,
                                                                      columnNumber: 25,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    M,
                                                                    {
                                                                      className:
                                                                        "text-red-600",
                                                                      onClick:
                                                                        () =>
                                                                          pe.mutate(
                                                                            s.id,
                                                                          ),
                                                                      "data-testid": `button-delete-${s.id}`,
                                                                      children:
                                                                        [
                                                                          e.jsxDEV(
                                                                            ye,
                                                                            {
                                                                              className:
                                                                                "h-4 w-4 mr-2",
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                              lineNumber: 590,
                                                                              columnNumber: 27,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          "Delete",
                                                                        ],
                                                                    },
                                                                    void 0,
                                                                    !0,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                      lineNumber: 585,
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
                                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                lineNumber: 549,
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
                                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                          lineNumber: 543,
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
                                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                    lineNumber: 528,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "mb-4",
                                                    children: [
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "flex items-center justify-between mb-2",
                                                          children: [
                                                            e.jsxDEV(
                                                              W,
                                                              {
                                                                variant:
                                                                  "secondary",
                                                                className: fe(
                                                                  s.workflowStage ||
                                                                    s.status,
                                                                ),
                                                                children: ge(
                                                                  s.workflowStage ||
                                                                    s.status,
                                                                ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                lineNumber: 600,
                                                                columnNumber: 23,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              "span",
                                                              {
                                                                className:
                                                                  "text-sm text-gray-500",
                                                                children: [
                                                                  X(
                                                                    s.workflowStage ||
                                                                      s.status,
                                                                    s.progress,
                                                                  ),
                                                                  "% Complete",
                                                                ],
                                                              },
                                                              void 0,
                                                              !0,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                lineNumber: 603,
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
                                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                          lineNumber: 599,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        Ke,
                                                        {
                                                          value: X(
                                                            s.workflowStage ||
                                                              s.status,
                                                            s.progress,
                                                          ),
                                                          className: "h-2",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                          lineNumber: 607,
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
                                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                    lineNumber: 598,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "space-y-2 text-sm text-gray-500 mb-4",
                                                    children: [
                                                      s.duration &&
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "flex items-center",
                                                            children: [
                                                              e.jsxDEV(
                                                                Ce,
                                                                {
                                                                  className:
                                                                    "h-3 w-3 mr-2",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                  lineNumber: 617,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              "Duration: ",
                                                              ve(s.duration),
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 616,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                      s.fileSize &&
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "flex items-center",
                                                            children: [
                                                              e.jsxDEV(
                                                                J,
                                                                {
                                                                  className:
                                                                    "h-3 w-3 mr-2",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                  lineNumber: 623,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              "Size: ",
                                                              je(s.fileSize),
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 622,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                      s.streams > 0 &&
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "flex items-center",
                                                            children: [
                                                              e.jsxDEV(
                                                                q,
                                                                {
                                                                  className:
                                                                    "h-3 w-3 mr-2",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                  lineNumber: 629,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              "Streams: ",
                                                              s.streams.toLocaleString(),
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 628,
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
                                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                    lineNumber: 614,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                s.description &&
                                                  e.jsxDEV(
                                                    "p",
                                                    {
                                                      className:
                                                        "text-sm text-gray-600 mb-4 line-clamp-2",
                                                      children: s.description,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                      lineNumber: 637,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "flex space-x-2",
                                                    onClick: (i) =>
                                                      i.stopPropagation(),
                                                    children: [
                                                      e.jsxDEV(
                                                        o,
                                                        {
                                                          variant: "outline",
                                                          size: "sm",
                                                          className: "flex-1",
                                                          onClick: () => _(s),
                                                          "data-testid": `button-play-bottom-${s.id}`,
                                                          children: [
                                                            v === s.id
                                                              ? e.jsxDEV(
                                                                  O,
                                                                  {
                                                                    className:
                                                                      "h-4 w-4 mr-2 animate-spin",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                    lineNumber: 650,
                                                                    columnNumber: 25,
                                                                  },
                                                                  this,
                                                                )
                                                              : x === s.id
                                                                ? e.jsxDEV(
                                                                    Z,
                                                                    {
                                                                      className:
                                                                        "h-4 w-4 mr-2",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                      lineNumber: 652,
                                                                      columnNumber: 25,
                                                                    },
                                                                    this,
                                                                  )
                                                                : e.jsxDEV(
                                                                    q,
                                                                    {
                                                                      className:
                                                                        "h-4 w-4 mr-2",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                      lineNumber: 654,
                                                                      columnNumber: 25,
                                                                    },
                                                                    this,
                                                                  ),
                                                            v === s.id
                                                              ? "Buffering…"
                                                              : x === s.id
                                                                ? "Pause"
                                                                : "Play",
                                                          ],
                                                        },
                                                        void 0,
                                                        !0,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                          lineNumber: 642,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      s.workflowStage ===
                                                        "delivery" ||
                                                      s.status === "completed"
                                                        ? e.jsxDEV(
                                                            o,
                                                            {
                                                              size: "sm",
                                                              className:
                                                                "flex-1",
                                                              onClick: () =>
                                                                c(
                                                                  `/analytics?project=${s.id}`,
                                                                ),
                                                              "data-testid": `button-analytics-bottom-${s.id}`,
                                                              children: [
                                                                e.jsxDEV(
                                                                  ee,
                                                                  {
                                                                    className:
                                                                      "h-4 w-4 mr-2",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                    lineNumber: 665,
                                                                    columnNumber: 25,
                                                                  },
                                                                  this,
                                                                ),
                                                                "Analytics",
                                                              ],
                                                            },
                                                            void 0,
                                                            !0,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                              lineNumber: 659,
                                                              columnNumber: 23,
                                                            },
                                                            this,
                                                          )
                                                        : e.jsxDEV(
                                                            o,
                                                            {
                                                              size: "sm",
                                                              className:
                                                                "flex-1",
                                                              onClick: () =>
                                                                c(
                                                                  `/studio/${s.id}`,
                                                                ),
                                                              "data-testid": `button-continue-${s.id}`,
                                                              children: [
                                                                e.jsxDEV(
                                                                  U,
                                                                  {
                                                                    className:
                                                                      "h-4 w-4 mr-2",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                    lineNumber: 675,
                                                                    columnNumber: 25,
                                                                  },
                                                                  this,
                                                                ),
                                                                "Continue",
                                                              ],
                                                            },
                                                            void 0,
                                                            !0,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                              lineNumber: 669,
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
                                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                    lineNumber: 641,
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
                                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                                              lineNumber: 526,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                        },
                                        s.id,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 525,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                    lineNumber: 519,
                                    columnNumber: 11,
                                  },
                                  this,
                                ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                          lineNumber: 495,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        re,
                        {
                          value: "songwriting",
                          className: "space-y-6",
                          children: e.jsxDEV(
                            Ye,
                            {},
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                              lineNumber: 688,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                          lineNumber: 687,
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
                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                    lineNumber: 483,
                    columnNumber: 9,
                  },
                  this,
                ),
              ],
            },
            void 0,
            !0,
            {
              fileName: "/home/runner/workspace/client/src/pages/Projects.tsx",
              lineNumber: 383,
              columnNumber: 7,
            },
            this,
          ),
        },
        void 0,
        !1,
        {
          fileName: "/home/runner/workspace/client/src/pages/Projects.tsx",
          lineNumber: 382,
          columnNumber: 5,
        },
        this,
      );
}
function Ye() {
  const { toast: y } = ne(),
    C = ie(),
    [n, c] = l.useState(null),
    [z, F] = l.useState(!1),
    [S, T] = l.useState(""),
    [x, g] = l.useState([]),
    [v, p] = l.useState(""),
    [t, a] = l.useState({
      title: "",
      genre: "hip-hop",
      mood: "",
      bpm: 90,
      key: "C",
      lyrics: "",
      notes: "",
    }),
    { data: I = [], isLoading: P } = te({ queryKey: ["/api/songwriting"] }),
    k = $({
      mutationFn: async (r) => (await V("POST", "/api/songwriting", r)).json(),
      onSuccess: () => {
        (C.invalidateQueries({ queryKey: ["/api/songwriting"] }),
          F(!1),
          a({
            title: "",
            genre: "hip-hop",
            mood: "",
            bpm: 90,
            key: "C",
            lyrics: "",
            notes: "",
          }),
          y({
            title: "Session Created",
            description: "Songwriting session saved",
          }));
      },
    }),
    E = $({
      mutationFn: async ({ id: r, ...m }) =>
        (await V("PUT", `/api/songwriting/${r}`, m)).json(),
      onSuccess: () => {
        (C.invalidateQueries({ queryKey: ["/api/songwriting"] }),
          y({ title: "Saved", description: "Session updated" }));
      },
    }),
    b = $({
      mutationFn: async (r) => {
        await V("DELETE", `/api/songwriting/${r}`);
      },
      onSuccess: () => {
        (C.invalidateQueries({ queryKey: ["/api/songwriting"] }),
          c(null),
          y({ title: "Deleted", description: "Session removed" }));
      },
    }),
    w = async () => {
      if (!S.trim()) return;
      const m = await (
        await V("POST", "/api/songwriting/ai-assist", {
          prompt: S,
          genre: n?.genre || "hip-hop",
        })
      ).json();
      (g(m.rhymes || []), p(m.chordProgression || ""));
    },
    d = [
      "Verse – Chorus – Verse – Chorus – Bridge – Chorus",
      "Intro – Verse – Pre-Chorus – Chorus – Verse – Chorus – Outro",
      "Intro – Hook – Verse – Hook – Bridge – Hook",
      "Verse – Verse – Chorus – Verse – Chorus – Outro",
    ];
  return e.jsxDEV(
    "div",
    {
      className: "grid grid-cols-1 lg:grid-cols-3 gap-6",
      children: [
        e.jsxDEV(
          "div",
          {
            className: "lg:col-span-1 space-y-4",
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
                        children: "Sessions",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Projects.tsx",
                        lineNumber: 765,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      ae,
                      {
                        open: z,
                        onOpenChange: F,
                        children: [
                          e.jsxDEV(
                            Qe,
                            {
                              asChild: !0,
                              children: e.jsxDEV(
                                o,
                                {
                                  size: "sm",
                                  className: "gradient-bg",
                                  children: [
                                    e.jsxDEV(
                                      Se,
                                      { className: "w-4 h-4 mr-1" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Projects.tsx",
                                        lineNumber: 768,
                                        columnNumber: 57,
                                      },
                                      this,
                                    ),
                                    "New",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Projects.tsx",
                                  lineNumber: 768,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                              lineNumber: 767,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            le,
                            {
                              children: [
                                e.jsxDEV(
                                  ce,
                                  {
                                    children: e.jsxDEV(
                                      oe,
                                      { children: "New Songwriting Session" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Projects.tsx",
                                        lineNumber: 771,
                                        columnNumber: 29,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                    lineNumber: 771,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "space-y-3",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          children: [
                                            e.jsxDEV(
                                              h,
                                              { children: "Title" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 773,
                                                columnNumber: 22,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              D,
                                              {
                                                placeholder: "Song title...",
                                                value: t.title,
                                                onChange: (r) =>
                                                  a({
                                                    ...t,
                                                    title: r.target.value,
                                                  }),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 773,
                                                columnNumber: 42,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 773,
                                          columnNumber: 17,
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
                                                children: [
                                                  e.jsxDEV(
                                                    h,
                                                    { children: "Genre" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                      lineNumber: 775,
                                                      columnNumber: 24,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    me,
                                                    {
                                                      value: t.genre,
                                                      onValueChange: (r) =>
                                                        a({ ...t, genre: r }),
                                                      children: [
                                                        e.jsxDEV(
                                                          ue,
                                                          {
                                                            children: e.jsxDEV(
                                                              de,
                                                              {},
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                lineNumber: 777,
                                                                columnNumber: 38,
                                                              },
                                                              this,
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 777,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          Ne,
                                                          {
                                                            children: [
                                                              "hip-hop",
                                                              "pop",
                                                              "rnb",
                                                              "rock",
                                                              "country",
                                                              "electronic",
                                                            ].map((r) =>
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: r,
                                                                  children: r,
                                                                },
                                                                r,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                                  lineNumber: 779,
                                                                  columnNumber: 89,
                                                                },
                                                                this,
                                                              ),
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                            lineNumber: 778,
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
                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                      lineNumber: 776,
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
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 775,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "div",
                                              {
                                                children: [
                                                  e.jsxDEV(
                                                    h,
                                                    { children: "Key" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                      lineNumber: 783,
                                                      columnNumber: 24,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    D,
                                                    {
                                                      placeholder:
                                                        "C, Am, F#...",
                                                      value: t.key,
                                                      onChange: (r) =>
                                                        a({
                                                          ...t,
                                                          key: r.target.value,
                                                        }),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                      lineNumber: 783,
                                                      columnNumber: 42,
                                                    },
                                                    this,
                                                  ),
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 783,
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
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 774,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          children: [
                                            e.jsxDEV(
                                              h,
                                              { children: "BPM" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 785,
                                                columnNumber: 22,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              D,
                                              {
                                                type: "number",
                                                value: t.bpm,
                                                onChange: (r) =>
                                                  a({
                                                    ...t,
                                                    bpm: Number(r.target.value),
                                                  }),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 785,
                                                columnNumber: 40,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 785,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          children: [
                                            e.jsxDEV(
                                              h,
                                              { children: "Mood" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 786,
                                                columnNumber: 22,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              D,
                                              {
                                                placeholder:
                                                  "melancholy, hype, romantic...",
                                                value: t.mood,
                                                onChange: (r) =>
                                                  a({
                                                    ...t,
                                                    mood: r.target.value,
                                                  }),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 786,
                                                columnNumber: 41,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 786,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        o,
                                        {
                                          className: "w-full gradient-bg",
                                          onClick: () => k.mutate(t),
                                          disabled: !t.title || k.isPending,
                                          children: [
                                            k.isPending
                                              ? e.jsxDEV(
                                                  O,
                                                  {
                                                    className:
                                                      "w-4 h-4 animate-spin mr-2",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                    lineNumber: 788,
                                                    columnNumber: 47,
                                                  },
                                                  this,
                                                )
                                              : null,
                                            "Create Session",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 787,
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
                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                    lineNumber: 772,
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
                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                              lineNumber: 770,
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
                          "/home/runner/workspace/client/src/pages/Projects.tsx",
                        lineNumber: 766,
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
                    "/home/runner/workspace/client/src/pages/Projects.tsx",
                  lineNumber: 764,
                  columnNumber: 9,
                },
                this,
              ),
              P
                ? e.jsxDEV(
                    "div",
                    {
                      className: "space-y-3",
                      children: [1, 2, 3].map((r) =>
                        e.jsxDEV(
                          j,
                          {
                            className: "p-4",
                            children: e.jsxDEV(
                              "div",
                              {
                                className:
                                  "flex items-start justify-between gap-3",
                                children: [
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className: "flex-1 space-y-2",
                                      children: [
                                        e.jsxDEV(
                                          B,
                                          { className: "h-4 w-48" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                            lineNumber: 801,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          B,
                                          { className: "h-3 w-32" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                            lineNumber: 802,
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
                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                      lineNumber: 800,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    B,
                                    { className: "h-5 w-16 rounded-full" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                      lineNumber: 804,
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
                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                lineNumber: 799,
                                columnNumber: 17,
                              },
                              this,
                            ),
                          },
                          r,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                            lineNumber: 798,
                            columnNumber: 15,
                          },
                          this,
                        ),
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                      lineNumber: 796,
                      columnNumber: 11,
                    },
                    this,
                  )
                : I.length === 0
                  ? e.jsxDEV(
                      j,
                      {
                        className: "p-8 text-center",
                        children: [
                          e.jsxDEV(
                            H,
                            {
                              className: "w-12 h-12 mx-auto mb-3 text-gray-300",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                              lineNumber: 811,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "p",
                            {
                              className: "text-gray-500",
                              children:
                                "No sessions yet. Create your first song!",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                              lineNumber: 812,
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
                          "/home/runner/workspace/client/src/pages/Projects.tsx",
                        lineNumber: 810,
                        columnNumber: 11,
                      },
                      this,
                    )
                  : I.map((r) =>
                      e.jsxDEV(
                        j,
                        {
                          className: `cursor-pointer hover:shadow-md transition-shadow ${n?.id === r.id ? "border-blue-500 shadow-md" : ""}`,
                          onClick: () => c(r),
                          children: e.jsxDEV(
                            L,
                            {
                              className: "p-4",
                              children: e.jsxDEV(
                                "div",
                                {
                                  className: "flex items-start justify-between",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "font-semibold text-sm",
                                              children: r.title,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                                              lineNumber: 819,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-xs text-gray-500 mt-1",
                                              children: [
                                                r.genre,
                                                " • ",
                                                r.key,
                                                " • ",
                                                r.bpm,
                                                " BPM",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                                              lineNumber: 820,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          r.mood &&
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-xs text-gray-400 mt-1",
                                                children: r.mood,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 821,
                                                columnNumber: 30,
                                              },
                                              this,
                                            ),
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Projects.tsx",
                                        lineNumber: 818,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      W,
                                      {
                                        variant: "outline",
                                        className: "text-xs",
                                        children: r.status?.replace("_", " "),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Projects.tsx",
                                        lineNumber: 823,
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
                                    "/home/runner/workspace/client/src/pages/Projects.tsx",
                                  lineNumber: 817,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                              lineNumber: 816,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        r.id,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                          lineNumber: 815,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    ),
            ],
          },
          void 0,
          !0,
          {
            fileName: "/home/runner/workspace/client/src/pages/Projects.tsx",
            lineNumber: 763,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          "div",
          {
            className: "lg:col-span-2 space-y-4",
            children: n
              ? e.jsxDEV(
                  e.Fragment,
                  {
                    children: [
                      e.jsxDEV(
                        j,
                        {
                          children: [
                            e.jsxDEV(
                              K,
                              {
                                children: e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "flex items-center justify-between",
                                    children: [
                                      e.jsxDEV(
                                        Q,
                                        {
                                          className: "text-lg",
                                          children: n.title,
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 836,
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
                                              o,
                                              {
                                                size: "sm",
                                                variant: "outline",
                                                onClick: () =>
                                                  E.mutate({
                                                    id: n.id,
                                                    lyrics: n.lyrics,
                                                    notes: n.notes,
                                                  }),
                                                disabled: E.isPending,
                                                children: E.isPending
                                                  ? e.jsxDEV(
                                                      O,
                                                      {
                                                        className:
                                                          "w-3 h-3 animate-spin",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                        lineNumber: 839,
                                                        columnNumber: 51,
                                                      },
                                                      this,
                                                    )
                                                  : "Save",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 838,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              o,
                                              {
                                                size: "sm",
                                                variant: "outline",
                                                className: "text-red-500",
                                                onClick: () => b.mutate(n.id),
                                                children: "Delete",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 841,
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
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 837,
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
                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                    lineNumber: 835,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                lineNumber: 834,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              L,
                              {
                                children: e.jsxDEV(
                                  "div",
                                  {
                                    className: "space-y-4",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          children: [
                                            e.jsxDEV(
                                              h,
                                              {
                                                className:
                                                  "text-sm font-medium mb-2 flex items-center gap-1",
                                                children: [
                                                  e.jsxDEV(
                                                    Te,
                                                    { className: "w-3 h-3" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                      lineNumber: 848,
                                                      columnNumber: 89,
                                                    },
                                                    this,
                                                  ),
                                                  "Lyrics",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 848,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              G,
                                              {
                                                className:
                                                  "min-h-[200px] font-mono text-sm",
                                                placeholder: `[Verse 1]
...

[Chorus]
...

[Bridge]
...`,
                                                value: n.lyrics || "",
                                                onChange: (r) =>
                                                  c({
                                                    ...n,
                                                    lyrics: r.target.value,
                                                  }),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 849,
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
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 847,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          children: [
                                            e.jsxDEV(
                                              h,
                                              {
                                                className:
                                                  "text-sm font-medium",
                                                children: "Notes",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 857,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              G,
                                              {
                                                className:
                                                  "min-h-[80px] text-sm",
                                                placeholder:
                                                  "Song ideas, references, production notes...",
                                                value: n.notes || "",
                                                onChange: (r) =>
                                                  c({
                                                    ...n,
                                                    notes: r.target.value,
                                                  }),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 858,
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
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 856,
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
                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                    lineNumber: 846,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                lineNumber: 845,
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
                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                          lineNumber: 833,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "div",
                        {
                          className: "grid grid-cols-1 md:grid-cols-2 gap-4",
                          children: [
                            e.jsxDEV(
                              j,
                              {
                                children: [
                                  e.jsxDEV(
                                    K,
                                    {
                                      children: e.jsxDEV(
                                        Q,
                                        {
                                          className:
                                            "text-sm flex items-center gap-1",
                                          children: [
                                            e.jsxDEV(
                                              Me,
                                              {
                                                className:
                                                  "w-4 h-4 text-yellow-500",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 866,
                                                columnNumber: 84,
                                              },
                                              this,
                                            ),
                                            "Rhyme Finder",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 866,
                                          columnNumber: 29,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                      lineNumber: 866,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    L,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "flex gap-2 mb-3",
                                            children: [
                                              e.jsxDEV(
                                                D,
                                                {
                                                  placeholder:
                                                    "Enter a word...",
                                                  value: S,
                                                  onChange: (r) =>
                                                    T(r.target.value),
                                                  onKeyDown: (r) =>
                                                    r.key === "Enter" && w(),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                  lineNumber: 869,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                o,
                                                {
                                                  size: "sm",
                                                  onClick: w,
                                                  children: "Find",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                  lineNumber: 870,
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
                                              "/home/runner/workspace/client/src/pages/Projects.tsx",
                                            lineNumber: 868,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        x.length > 0 &&
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className: "flex flex-wrap gap-2",
                                              children: x.map((r) =>
                                                e.jsxDEV(
                                                  W,
                                                  {
                                                    variant: "secondary",
                                                    className:
                                                      "cursor-pointer hover:bg-blue-100",
                                                    onClick: () =>
                                                      c({
                                                        ...n,
                                                        lyrics:
                                                          (n.lyrics || "") +
                                                          " " +
                                                          r,
                                                      }),
                                                    children: r,
                                                  },
                                                  r,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                    lineNumber: 875,
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
                                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                                              lineNumber: 873,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                        v &&
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-xs text-gray-500 mt-3 border-t pt-2",
                                              children: [
                                                e.jsxDEV(
                                                  "span",
                                                  {
                                                    className: "font-medium",
                                                    children:
                                                      "Suggested chords:",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                    lineNumber: 881,
                                                    columnNumber: 87,
                                                  },
                                                  this,
                                                ),
                                                " ",
                                                v,
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Projects.tsx",
                                              lineNumber: 881,
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
                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                      lineNumber: 867,
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
                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                lineNumber: 865,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              j,
                              {
                                children: [
                                  e.jsxDEV(
                                    K,
                                    {
                                      children: e.jsxDEV(
                                        Q,
                                        {
                                          className:
                                            "text-sm flex items-center gap-1",
                                          children: [
                                            e.jsxDEV(
                                              Le,
                                              {
                                                className:
                                                  "w-4 h-4 text-purple-500",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 886,
                                                columnNumber: 84,
                                              },
                                              this,
                                            ),
                                            "Song Structure Templates",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 886,
                                          columnNumber: 29,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                      lineNumber: 886,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    L,
                                    {
                                      children: e.jsxDEV(
                                        "div",
                                        {
                                          className: "space-y-2",
                                          children: d.map((r, m) =>
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20",
                                                onClick: () =>
                                                  c({
                                                    ...n,
                                                    lyrics:
                                                      r +
                                                      `

` +
                                                      (n.lyrics || ""),
                                                  }),
                                                children: [
                                                  e.jsxDEV(
                                                    $e,
                                                    {
                                                      className:
                                                        "w-3 h-3 mt-0.5 text-blue-500 flex-shrink-0",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                      lineNumber: 892,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                                  r,
                                                ],
                                              },
                                              m,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                                lineNumber: 890,
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
                                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                                          lineNumber: 888,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Projects.tsx",
                                      lineNumber: 887,
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
                                  "/home/runner/workspace/client/src/pages/Projects.tsx",
                                lineNumber: 885,
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
                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                          lineNumber: 864,
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
                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                    lineNumber: 832,
                    columnNumber: 11,
                  },
                  this,
                )
              : e.jsxDEV(
                  j,
                  {
                    className: "p-12 text-center",
                    children: [
                      e.jsxDEV(
                        H,
                        { className: "w-16 h-16 mx-auto mb-4 text-gray-200" },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                          lineNumber: 902,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "h3",
                        {
                          className: "text-lg font-medium text-gray-500 mb-2",
                          children: "Select a session",
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                          lineNumber: 903,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "p",
                        {
                          className: "text-sm text-gray-400",
                          children:
                            "Choose a session from the list or create a new one to start writing",
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Projects.tsx",
                          lineNumber: 904,
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
                      "/home/runner/workspace/client/src/pages/Projects.tsx",
                    lineNumber: 901,
                    columnNumber: 11,
                  },
                  this,
                ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Projects.tsx",
            lineNumber: 830,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    !0,
    {
      fileName: "/home/runner/workspace/client/src/pages/Projects.tsx",
      lineNumber: 762,
      columnNumber: 5,
    },
    this,
  );
}
export { os as default };
