import {
  r as V,
  f as e,
  aY as Z,
  eh as We,
  bR as bn,
  aO as Bn,
  cc as Pe,
  cY as xn,
  ap as K,
  aR as Ve,
  b2 as vn,
  bK as Wn,
  dj as Xn,
  b$ as X,
  b9 as Hn,
  ag as qn,
  bS as ie,
  aJ as $e,
  bg as Fe,
  y as Jn,
  n as Qn,
  c7 as Xe,
  al as gn,
  a_ as Kn,
  b6 as wn,
  aL as Vn,
  v as Zn,
  bj as et,
  eL as nt,
} from "./vendor-react-31oK5L0i.js";
import {
  u as He,
  C as qe,
  d as Je,
  f as Qe,
  g as Ke,
  h as Ze,
  a4 as tt,
  a5 as rt,
  a6 as ge,
  a9 as we,
  L,
  I as ce,
  j as Y,
  B as D,
  P as $,
  a as De,
  y as ot,
  W as Ue,
  X as Oe,
  Y as Ye,
  Z as Be,
  $ as Q,
  k as Le,
} from "./studio-DOUfHW5v.js";
function St() {
  const [n, r] = V.useState("image"),
    [t, l] = V.useState(""),
    [s, c] = V.useState(""),
    [m, f] = V.useState(""),
    [h, d] = V.useState(""),
    [v, k] = V.useState(""),
    [y, C] = V.useState(!1),
    [u, i] = V.useState(null),
    { toast: w } = He(),
    N = async (o, p, A) => {
      (C(!0), i(null));
      try {
        const F = `/api/content-analysis/${o}`,
          R = await (
            await De(
              "POST",
              F,
              o === "text"
                ? { text: A }
                : o === "video"
                  ? { videoUrl: p, duration: 30 }
                  : o === "audio"
                    ? { audioUrl: p }
                    : o === "website"
                      ? { url: p }
                      : { imageUrl: p },
            )
          ).json();
        R.success &&
          (i({ type: o, data: R.analysis, timestamp: R.timestamp }),
          w({
            title: "✨ Analysis Complete",
            description: `Your ${o} has been analyzed with AI-powered insights.`,
          }));
      } catch (F) {
        w({
          title: "Analysis Failed",
          description:
            F.message || "Failed to analyze content. Please try again.",
          variant: "destructive",
        });
      } finally {
        C(!1);
      }
    },
    b = async () => {
      if (u)
        try {
          (await De("POST", "/api/autopilot/save-features", {
            contentType: u.type,
            features: u.data,
            contentUrl:
              u.type === "image"
                ? t
                : u.type === "video"
                  ? s
                  : u.type === "audio"
                    ? m
                    : u.type === "website"
                      ? v
                      : void 0,
            contentText: u.type === "text" ? h : void 0,
          }),
            w({
              title: "🎯 Saved for Training",
              description:
                "This content analysis will be used to improve your autopilot AI predictions.",
              duration: 3e3,
            }));
        } catch (o) {
          w({
            title: "Save Failed",
            description: o.message || "Failed to save for autopilot training.",
            variant: "destructive",
          });
        }
    },
    x = (o) =>
      e.jsxDEV(
        "div",
        {
          className: "space-y-4",
          children: [
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h4",
                    {
                      className: "font-semibold mb-2 flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          Wn,
                          { className: "h-4 w-4" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 118,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        "Visual Composition",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 117,
                      columnNumber: 9,
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
                            className: "space-y-1",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children: "Layout",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 123,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                D,
                                {
                                  variant: "secondary",
                                  children: o.composition?.layout,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 124,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 122,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-1",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children: "Color Mood",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 127,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                D,
                                {
                                  variant: "secondary",
                                  children: o.colors?.mood,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 128,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 126,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-1",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children: "Complexity",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 131,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                $,
                                {
                                  value: o.composition?.complexity * 100,
                                  className: "h-2",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 132,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 130,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-1",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children: "Attention Score",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 135,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                $,
                                {
                                  value: o.engagement?.attentionGrabbing * 100,
                                  className: "h-2",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 136,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 134,
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
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 121,
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
                  "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                lineNumber: 116,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h4",
                    {
                      className: "font-semibold mb-2 flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          Xn,
                          { className: "h-4 w-4" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 143,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        "Engagement Potential",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 142,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "space-y-2",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center justify-between",
                            children: [
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm",
                                  children: "Shareability",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 148,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm font-medium",
                                  children: [
                                    Math.round(
                                      o.engagement?.shareability * 100,
                                    ),
                                    "%",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 149,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 147,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          $,
                          { value: o.engagement?.shareability * 100 },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 151,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center justify-between",
                            children: [
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm",
                                  children: "Emotional Impact",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 154,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                D,
                                { children: o.engagement?.emotionalImpact },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 155,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 153,
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
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 146,
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
                  "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                lineNumber: 141,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h4",
                    {
                      className: "font-semibold mb-2",
                      children: "Content Details",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 161,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "grid grid-cols-2 gap-2 text-sm",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center gap-2",
                            children: [
                              e.jsxDEV(
                                X,
                                { className: "h-3 w-3" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 164,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              "Faces: ",
                              o.content?.hasFaces
                                ? `Yes (${o.content.faceCount})`
                                : "No",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 163,
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
                                X,
                                { className: "h-3 w-3" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 168,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              "Text: ",
                              o.content?.hasText
                                ? o.content.textAmount
                                : "None",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 167,
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
                                X,
                                { className: "h-3 w-3" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 172,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              "Branding: ",
                              Math.round(o.branding?.brandingStrength * 100),
                              "%",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 171,
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
                                X,
                                { className: "h-3 w-3" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 176,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              "Quality: ",
                              Math.round(o.branding?.professionalQuality * 100),
                              "%",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 175,
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
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 162,
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
                  "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                lineNumber: 160,
                columnNumber: 7,
              },
              this,
            ),
            o.vibe &&
              o.vibe.length > 0 &&
              e.jsxDEV(
                "div",
                {
                  children: [
                    e.jsxDEV(
                      "h4",
                      {
                        className: "font-semibold mb-2",
                        children: "Visual Vibe",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 184,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className: "flex flex-wrap gap-2",
                        children: o.vibe.map((p, A) =>
                          e.jsxDEV(
                            D,
                            { variant: "outline", children: p },
                            A,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 187,
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
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 185,
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
                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                  lineNumber: 183,
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
            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
          lineNumber: 115,
          columnNumber: 5,
        },
        this,
      ),
    g = (o) =>
      e.jsxDEV(
        "div",
        {
          className: "space-y-4",
          children: [
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h4",
                    {
                      className: "font-semibold mb-2 flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          bn,
                          { className: "h-4 w-4" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 199,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        "Video Metrics",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 198,
                      columnNumber: 9,
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
                            className: "space-y-1",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children: "Duration",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 204,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                D,
                                {
                                  variant: "secondary",
                                  children: [o.duration, "s"],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 205,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 203,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-1",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children: "Motion",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 208,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                D,
                                {
                                  variant: "secondary",
                                  children: o.motion?.intensity,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 209,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 207,
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
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 202,
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
                  "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                lineNumber: 197,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h4",
                    {
                      className: "font-semibold mb-2 flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          Hn,
                          { className: "h-4 w-4" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 216,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        "Engagement Scores",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 215,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "space-y-2",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center justify-between",
                            children: [
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm",
                                  children: "Hook Strength",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 221,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm font-medium",
                                  children: [
                                    Math.round(
                                      o.engagement?.hookStrength * 100,
                                    ),
                                    "%",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 222,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 220,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          $,
                          { value: o.engagement?.hookStrength * 100 },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 224,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center justify-between",
                            children: [
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm",
                                  children: "Viral Potential",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 227,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm font-medium",
                                  children: [
                                    Math.round(o.viralPotential * 100),
                                    "%",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 228,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 226,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          $,
                          { value: o.viralPotential * 100 },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 230,
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
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 219,
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
                  "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                lineNumber: 214,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h4",
                    {
                      className: "font-semibold mb-2",
                      children: "Retention Estimates",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 235,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "space-y-2",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center justify-between",
                            children: [
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm",
                                  children: "First 5 Seconds",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 238,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm font-medium",
                                  children: [
                                    Math.round(
                                      o.engagement?.retention?.first5Seconds *
                                        100,
                                    ),
                                    "%",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 239,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 237,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          $,
                          {
                            value: o.engagement?.retention?.first5Seconds * 100,
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 241,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center justify-between",
                            children: [
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm",
                                  children: "Overall Retention",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 244,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm font-medium",
                                  children: [
                                    Math.round(
                                      o.engagement?.retention?.overall * 100,
                                    ),
                                    "%",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 245,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 243,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          $,
                          { value: o.engagement?.retention?.overall * 100 },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
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
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 236,
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
                  "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                lineNumber: 234,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h4",
                    {
                      className: "font-semibold mb-2",
                      children: "Audio & Visual",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 252,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "grid grid-cols-2 gap-2 text-sm",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center gap-2",
                            children: [
                              e.jsxDEV(
                                X,
                                { className: "h-3 w-3" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 255,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              "Music: ",
                              o.audio?.hasMusic ? "Yes" : "No",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 254,
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
                                X,
                                { className: "h-3 w-3" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 259,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              "Speech: ",
                              o.audio?.hasSpeech ? "Yes" : "No",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 258,
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
                                X,
                                { className: "h-3 w-3" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 263,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              "CTA: ",
                              o.engagement?.callToActionPresence
                                ? "Present"
                                : "None",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 262,
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
                                X,
                                { className: "h-3 w-3" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 267,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              "Quality: ",
                              Math.round(o.visual?.quality * 100),
                              "%",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 266,
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
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
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
                fileName:
                  "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                lineNumber: 251,
                columnNumber: 7,
              },
              this,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName:
            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
          lineNumber: 196,
          columnNumber: 5,
        },
        this,
      ),
    E = (o) =>
      e.jsxDEV(
        "div",
        {
          className: "space-y-4",
          children: [
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h4",
                    {
                      className: "font-semibold mb-2 flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          Pe,
                          { className: "h-4 w-4" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 279,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        "Text Metrics",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 278,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "grid grid-cols-3 gap-3",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-1",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children: "Words",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 284,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                D,
                                {
                                  variant: "secondary",
                                  children: o.structure?.length,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 285,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 283,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-1",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children: "Sentiment",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 288,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                D,
                                {
                                  variant: "secondary",
                                  children: o.tone?.sentiment,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 289,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 287,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-1",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children: "Formality",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 292,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                D,
                                {
                                  variant: "secondary",
                                  children: o.tone?.formality,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 293,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 291,
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
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 282,
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
                  "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                lineNumber: 277,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h4",
                    {
                      className: "font-semibold mb-2 flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          Ve,
                          { className: "h-4 w-4" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 300,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        "Performance Scores",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 299,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "space-y-2",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center justify-between",
                            children: [
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm",
                                  children: "Energy Level",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 305,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm font-medium",
                                  children: [
                                    Math.round(o.tone?.energy * 100),
                                    "%",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 306,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 304,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          $,
                          { value: o.tone?.energy * 100 },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 308,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center justify-between",
                            children: [
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm",
                                  children: "Viral Potential",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 311,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm font-medium",
                                  children: [
                                    Math.round(
                                      o.engagement?.viralPotential * 100,
                                    ),
                                    "%",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 312,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 310,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          $,
                          { value: o.engagement?.viralPotential * 100 },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 314,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center justify-between",
                            children: [
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm",
                                  children: "Persuasiveness",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 317,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm font-medium",
                                  children: [
                                    Math.round(o.quality?.persuasiveness * 100),
                                    "%",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 318,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 316,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          $,
                          { value: o.quality?.persuasiveness * 100 },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 320,
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
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 303,
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
                  "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                lineNumber: 298,
                columnNumber: 7,
              },
              this,
            ),
            o.content?.mainTopics &&
              o.content.mainTopics.length > 0 &&
              e.jsxDEV(
                "div",
                {
                  children: [
                    e.jsxDEV(
                      "h4",
                      {
                        className: "font-semibold mb-2",
                        children: "Main Topics",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 326,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className: "flex flex-wrap gap-2",
                        children: o.content.mainTopics.map((p, A) =>
                          e.jsxDEV(
                            D,
                            { variant: "outline", children: p },
                            A,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 329,
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
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 327,
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
                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                  lineNumber: 325,
                  columnNumber: 9,
                },
                this,
              ),
            o.tone?.emotion &&
              o.tone.emotion.length > 0 &&
              e.jsxDEV(
                "div",
                {
                  children: [
                    e.jsxDEV(
                      "h4",
                      {
                        className: "font-semibold mb-2",
                        children: "Emotional Tone",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 337,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className: "flex flex-wrap gap-2",
                        children: o.tone.emotion.map((p, A) =>
                          e.jsxDEV(
                            D,
                            { children: p },
                            A,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 340,
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
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 338,
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
                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                  lineNumber: 336,
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
            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
          lineNumber: 276,
          columnNumber: 5,
        },
        this,
      ),
    j = (o) =>
      e.jsxDEV(
        "div",
        {
          className: "space-y-4",
          children: [
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h4",
                    {
                      className: "font-semibold mb-2 flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          xn,
                          { className: "h-4 w-4" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 352,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        "Design & UX",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 351,
                      columnNumber: 9,
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
                            className: "space-y-1",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children: "Layout",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 357,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                D,
                                {
                                  variant: "secondary",
                                  children: o.design?.layout,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 358,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 356,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-1",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children: "Color Scheme",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 361,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                D,
                                {
                                  variant: "secondary",
                                  children: o.design?.colorScheme,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 362,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 360,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-1",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children: "Visual Hierarchy",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 365,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                $,
                                {
                                  value: o.design?.visualHierarchy * 100,
                                  className: "h-2",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 366,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 364,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-1",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children: "Mobile Optimized",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 369,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                D,
                                {
                                  variant: o.ux?.mobileOptimized
                                    ? "default"
                                    : "destructive",
                                  children: o.ux?.mobileOptimized
                                    ? "Yes"
                                    : "No",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 370,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 368,
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
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 355,
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
                  "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                lineNumber: 350,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h4",
                    {
                      className: "font-semibold mb-2 flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          vn,
                          { className: "h-4 w-4" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 379,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        "Conversion Optimization",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 378,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "space-y-2",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center justify-between",
                            children: [
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm",
                                  children: "CTA Clarity",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 384,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm font-medium",
                                  children: [
                                    Math.round(o.content?.ctaClarity * 100),
                                    "%",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 385,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 383,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          $,
                          { value: o.content?.ctaClarity * 100 },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 387,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center justify-between",
                            children: [
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm",
                                  children: "Overall Conversion Score",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 390,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                {
                                  className: "text-sm font-medium",
                                  children: [
                                    Math.round(
                                      o.conversion?.conversionOptimization *
                                        100,
                                    ),
                                    "%",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 391,
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
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 389,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          $,
                          { value: o.conversion?.conversionOptimization * 100 },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 393,
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
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 382,
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
                  "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                lineNumber: 377,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                children: [
                  e.jsxDEV(
                    "h4",
                    {
                      className: "font-semibold mb-2",
                      children: "Trust Signals",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 398,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "grid grid-cols-2 gap-2 text-sm",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center gap-2",
                            children: [
                              e.jsxDEV(
                                X,
                                { className: "h-3 w-3" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 401,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              "Social Proof: ",
                              o.content?.socialProof ? "Yes" : "No",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 400,
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
                                X,
                                { className: "h-3 w-3" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 405,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              "Urgency: ",
                              o.conversion?.urgency ? "Yes" : "No",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 404,
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
                                X,
                                { className: "h-3 w-3" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 409,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              "Scarcity: ",
                              o.conversion?.scarcity ? "Yes" : "No",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 408,
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
                                X,
                                { className: "h-3 w-3" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                  lineNumber: 413,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              "Guarantees: ",
                              o.conversion?.guarantees ? "Yes" : "No",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                            lineNumber: 412,
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
                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                      lineNumber: 399,
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
                  "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                lineNumber: 397,
                columnNumber: 7,
              },
              this,
            ),
            o.content?.trustSignals &&
              o.content.trustSignals.length > 0 &&
              e.jsxDEV(
                "div",
                {
                  children: [
                    e.jsxDEV(
                      "h4",
                      {
                        className: "font-semibold mb-2",
                        children: "Trust Elements",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 421,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className: "flex flex-wrap gap-2",
                        children: o.content.trustSignals.map((p, A) =>
                          e.jsxDEV(
                            D,
                            { variant: "outline", children: p },
                            A,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 424,
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
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 422,
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
                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                  lineNumber: 420,
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
            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
          lineNumber: 349,
          columnNumber: 5,
        },
        this,
      );
  return e.jsxDEV(
    qe,
    {
      className: "border-primary/20",
      children: [
        e.jsxDEV(
          Je,
          {
            children: [
              e.jsxDEV(
                "div",
                {
                  className: "flex items-center gap-2",
                  children: [
                    e.jsxDEV(
                      Z,
                      { className: "h-5 w-5 text-primary" },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 436,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      Qe,
                      { children: "Multimodal Content Analysis" },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 437,
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
                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                  lineNumber: 435,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                Ke,
                {
                  children:
                    "AI-powered analysis of images, videos, audio, text, and websites to maximize engagement",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                  lineNumber: 439,
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
              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
            lineNumber: 434,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          Ze,
          {
            children: [
              e.jsxDEV(
                tt,
                {
                  value: n,
                  onValueChange: (o) => r(o),
                  className: "space-y-4",
                  children: [
                    e.jsxDEV(
                      rt,
                      {
                        className: "grid grid-cols-5 w-full",
                        children: [
                          e.jsxDEV(
                            ge,
                            {
                              value: "image",
                              children: [
                                e.jsxDEV(
                                  We,
                                  { className: "h-4 w-4 mr-2" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 447,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                "Image",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 446,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            ge,
                            {
                              value: "video",
                              children: [
                                e.jsxDEV(
                                  bn,
                                  { className: "h-4 w-4 mr-2" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 451,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                "Video",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 450,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            ge,
                            {
                              value: "audio",
                              children: [
                                e.jsxDEV(
                                  Bn,
                                  { className: "h-4 w-4 mr-2" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 455,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                "Audio",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 454,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            ge,
                            {
                              value: "text",
                              children: [
                                e.jsxDEV(
                                  Pe,
                                  { className: "h-4 w-4 mr-2" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 459,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                "Text",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 458,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            ge,
                            {
                              value: "website",
                              children: [
                                e.jsxDEV(
                                  xn,
                                  { className: "h-4 w-4 mr-2" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 463,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                "Website",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 462,
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
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 445,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      we,
                      {
                        value: "image",
                        className: "space-y-4",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              className: "space-y-2",
                              children: [
                                e.jsxDEV(
                                  L,
                                  { children: "Image URL" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 470,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex gap-2",
                                    children: [
                                      e.jsxDEV(
                                        ce,
                                        {
                                          placeholder:
                                            "https://example.com/image.jpg",
                                          value: t,
                                          onChange: (o) => l(o.target.value),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                          lineNumber: 472,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        Y,
                                        {
                                          onClick: () => N("image", t),
                                          disabled: y || !t,
                                          children: y
                                            ? e.jsxDEV(
                                                K,
                                                {
                                                  className:
                                                    "h-4 w-4 animate-spin",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                  lineNumber: 481,
                                                  columnNumber: 32,
                                                },
                                                this,
                                              )
                                            : "Analyze",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                          lineNumber: 477,
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
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 471,
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
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 469,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          u && u.type === "image" && x(u.data),
                        ],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 468,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      we,
                      {
                        value: "video",
                        className: "space-y-4",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              className: "space-y-2",
                              children: [
                                e.jsxDEV(
                                  L,
                                  { children: "Video URL" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 490,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex gap-2",
                                    children: [
                                      e.jsxDEV(
                                        ce,
                                        {
                                          placeholder:
                                            "https://example.com/video.mp4",
                                          value: s,
                                          onChange: (o) => c(o.target.value),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                          lineNumber: 492,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        Y,
                                        {
                                          onClick: () => N("video", s),
                                          disabled: y || !s,
                                          children: y
                                            ? e.jsxDEV(
                                                K,
                                                {
                                                  className:
                                                    "h-4 w-4 animate-spin",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                  lineNumber: 501,
                                                  columnNumber: 32,
                                                },
                                                this,
                                              )
                                            : "Analyze",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
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
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 491,
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
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 489,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          u && u.type === "video" && g(u.data),
                        ],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 488,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      we,
                      {
                        value: "audio",
                        className: "space-y-4",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              className: "space-y-2",
                              children: [
                                e.jsxDEV(
                                  L,
                                  { children: "Audio URL" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 510,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex gap-2",
                                    children: [
                                      e.jsxDEV(
                                        ce,
                                        {
                                          placeholder:
                                            "https://example.com/track.mp3",
                                          value: m,
                                          onChange: (o) => f(o.target.value),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                          lineNumber: 512,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        Y,
                                        {
                                          onClick: () => N("audio", m),
                                          disabled: y || !m,
                                          children: y
                                            ? e.jsxDEV(
                                                K,
                                                {
                                                  className:
                                                    "h-4 w-4 animate-spin",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                  lineNumber: 521,
                                                  columnNumber: 32,
                                                },
                                                this,
                                              )
                                            : "Analyze",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                          lineNumber: 517,
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
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 511,
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
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 509,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          u &&
                            u.type === "audio" &&
                            e.jsxDEV(
                              "div",
                              {
                                className: "space-y-4",
                                children: [
                                  e.jsxDEV(
                                    "div",
                                    {
                                      children: [
                                        e.jsxDEV(
                                          "h4",
                                          {
                                            className: "font-semibold mb-2",
                                            children: "Music Analysis",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                            lineNumber: 528,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "grid grid-cols-3 gap-3",
                                            children: [
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  children: [
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className:
                                                          "text-sm text-muted-foreground",
                                                        children: "Tempo",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                        lineNumber: 531,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      D,
                                                      {
                                                        children: [
                                                          u.data.music?.tempo,
                                                          " BPM",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                        lineNumber: 532,
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
                                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                  lineNumber: 530,
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
                                                          "text-sm text-muted-foreground",
                                                        children: "Key",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                        lineNumber: 535,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      D,
                                                      {
                                                        children:
                                                          u.data.music?.key,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                        lineNumber: 536,
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
                                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                  lineNumber: 534,
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
                                                          "text-sm text-muted-foreground",
                                                        children: "Mode",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                        lineNumber: 539,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      D,
                                                      {
                                                        children:
                                                          u.data.music?.mode,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                        lineNumber: 540,
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
                                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                  lineNumber: 538,
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
                                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                            lineNumber: 529,
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
                                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                      lineNumber: 527,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "div",
                                    {
                                      children: [
                                        e.jsxDEV(
                                          "h4",
                                          {
                                            className: "font-semibold mb-2",
                                            children: "Audio Qualities",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                            lineNumber: 545,
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
                                                "div",
                                                {
                                                  className:
                                                    "flex items-center justify-between",
                                                  children: [
                                                    e.jsxDEV(
                                                      "span",
                                                      {
                                                        className: "text-sm",
                                                        children: "Energy",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                        lineNumber: 548,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "span",
                                                      {
                                                        className:
                                                          "text-sm font-medium",
                                                        children: [
                                                          Math.round(
                                                            u.data.music
                                                              ?.energy * 100,
                                                          ),
                                                          "%",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
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
                                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                  lineNumber: 547,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                $,
                                                {
                                                  value:
                                                    u.data.music?.energy * 100,
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                  lineNumber: 551,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "flex items-center justify-between",
                                                  children: [
                                                    e.jsxDEV(
                                                      "span",
                                                      {
                                                        className: "text-sm",
                                                        children:
                                                          "Marketability",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                        lineNumber: 553,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "span",
                                                      {
                                                        className:
                                                          "text-sm font-medium",
                                                        children: [
                                                          Math.round(
                                                            u.data
                                                              .marketability *
                                                              100,
                                                          ),
                                                          "%",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                        lineNumber: 554,
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
                                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                  lineNumber: 552,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                $,
                                                {
                                                  value:
                                                    u.data.marketability * 100,
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                  lineNumber: 556,
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
                                              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                            lineNumber: 546,
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
                                        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                      lineNumber: 544,
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
                                  "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                lineNumber: 526,
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
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 508,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      we,
                      {
                        value: "text",
                        className: "space-y-4",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              className: "space-y-2",
                              children: [
                                e.jsxDEV(
                                  L,
                                  { children: "Text Content" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 565,
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
                                        "textarea",
                                        {
                                          className:
                                            "w-full min-h-[120px] p-3 rounded-md border bg-background",
                                          placeholder:
                                            "Enter your text content to analyze...",
                                          value: h,
                                          onChange: (o) => d(o.target.value),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                          lineNumber: 567,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        Y,
                                        {
                                          onClick: () => N("text", "", h),
                                          disabled: y || !h,
                                          className: "w-full",
                                          children: y
                                            ? e.jsxDEV(
                                                K,
                                                {
                                                  className:
                                                    "h-4 w-4 animate-spin",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                  lineNumber: 578,
                                                  columnNumber: 32,
                                                },
                                                this,
                                              )
                                            : "Analyze Text",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                          lineNumber: 573,
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
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 566,
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
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 564,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          u && u.type === "text" && E(u.data),
                        ],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 563,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      we,
                      {
                        value: "website",
                        className: "space-y-4",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              className: "space-y-2",
                              children: [
                                e.jsxDEV(
                                  L,
                                  { children: "Website URL" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 587,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex gap-2",
                                    children: [
                                      e.jsxDEV(
                                        ce,
                                        {
                                          placeholder: "https://example.com",
                                          value: v,
                                          onChange: (o) => k(o.target.value),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                          lineNumber: 589,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        Y,
                                        {
                                          onClick: () => {
                                            const o = v.trim(),
                                              p =
                                                o && !/^https?:\/\//i.test(o)
                                                  ? `https://${o}`
                                                  : o;
                                            N("website", p);
                                          },
                                          disabled: y || !v,
                                          children: y
                                            ? e.jsxDEV(
                                                K,
                                                {
                                                  className:
                                                    "h-4 w-4 animate-spin",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                                  lineNumber: 602,
                                                  columnNumber: 32,
                                                },
                                                this,
                                              )
                                            : "Analyze",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                          lineNumber: 594,
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
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 588,
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
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 586,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          u && u.type === "website" && j(u.data),
                        ],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 585,
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
                    "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                  lineNumber: 444,
                  columnNumber: 9,
                },
                this,
              ),
              u &&
                !y &&
                e.jsxDEV(
                  "div",
                  {
                    className:
                      "mt-4 p-4 border rounded-lg bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/20 dark:to-blue-950/20 border-cyan-200 dark:border-cyan-800",
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
                                  "h4",
                                  {
                                    className:
                                      "font-semibold flex items-center gap-2",
                                    children: [
                                      e.jsxDEV(
                                        Ve,
                                        { className: "h-4 w-4 text-cyan-600" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                          lineNumber: 616,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      "Use for Autopilot Training",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 615,
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
                                      "Save this analysis to improve your AI autopilot predictions for future content",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 619,
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
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 614,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            Y,
                            {
                              onClick: b,
                              variant: "default",
                              className: "bg-cyan-600 hover:bg-cyan-700",
                              children: [
                                e.jsxDEV(
                                  vn,
                                  { className: "h-4 w-4 mr-2" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 628,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                "Save for Training",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 623,
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
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 613,
                        columnNumber: 13,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                    lineNumber: 612,
                    columnNumber: 11,
                  },
                  this,
                ),
              y &&
                e.jsxDEV(
                  "div",
                  {
                    className: "mt-4 p-4 border rounded-lg bg-muted/30",
                    children: e.jsxDEV(
                      "div",
                      {
                        className: "flex items-center gap-3",
                        children: [
                          e.jsxDEV(
                            K,
                            { className: "h-5 w-5 animate-spin text-primary" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 638,
                              columnNumber: 15,
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
                                    children: "Analyzing your content...",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 640,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "p",
                                  {
                                    className: "text-sm text-muted-foreground",
                                    children:
                                      "Our AI is extracting features to optimize engagement",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                                    lineNumber: 641,
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
                                "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                              lineNumber: 639,
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
                          "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                        lineNumber: 637,
                        columnNumber: 13,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
                    lineNumber: 636,
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
              "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
            lineNumber: 443,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    !0,
    {
      fileName:
        "/home/runner/workspace/client/src/components/content/ContentAnalyzer.tsx",
      lineNumber: 433,
      columnNumber: 5,
    },
    this,
  );
}
const yn = {
  cinematic_promo: {
    bg1: "#030206",
    bg2: "#180c2e",
    bg3: "#08040e",
    bg2Light: "#3a1c6e",
    accent: "#c9a84c",
    accent2: "#e8c97a",
    text: "#f5f0e8",
    textDim: "#a09880",
    grain: !0,
    grainAmount: 0.07,
    grainTemp: "warm",
    shadowTint: "#0a0618",
    highlightTint: "#c9a84c",
    vignetteStrength: 0.88,
    keyLightX: 0.55,
    keyLightY: 0.38,
  },
  lyric_video: {
    bg1: "#010108",
    bg2: "#04021a",
    bg3: "#020610",
    bg2Light: "#0a0a60",
    accent: "#00e5ff",
    accent2: "#7c4dff",
    text: "#ffffff",
    textDim: "#80d8ff",
    grain: !0,
    grainAmount: 0.035,
    grainTemp: "cool",
    shadowTint: "#020410",
    highlightTint: "#00e5ff",
    vignetteStrength: 0.75,
    keyLightX: 0.5,
    keyLightY: 0.45,
  },
  music_visualizer: {
    bg1: "#000408",
    bg2: "#000c28",
    bg3: "#000618",
    bg2Light: "#002060",
    accent: "#00b0ff",
    accent2: "#18ffff",
    text: "#e3f2fd",
    textDim: "#4fc3f7",
    grain: !0,
    grainAmount: 0.028,
    grainTemp: "cool",
    shadowTint: "#000820",
    highlightTint: "#00b0ff",
    vignetteStrength: 0.82,
    keyLightX: 0.5,
    keyLightY: 0.35,
  },
  album_promo: {
    bg1: "#0a0400",
    bg2: "#200a00",
    bg3: "#120600",
    bg2Light: "#3a1800",
    accent: "#ff6d00",
    accent2: "#ffab40",
    text: "#fff8f0",
    textDim: "#bf8040",
    grain: !0,
    grainAmount: 0.065,
    grainTemp: "warm",
    shadowTint: "#100400",
    highlightTint: "#ff6d00",
    vignetteStrength: 0.9,
    keyLightX: 0.62,
    keyLightY: 0.32,
  },
  artist_spotlight: {
    bg1: "#030003",
    bg2: "#0c000e",
    bg3: "#060008",
    bg2Light: "#280028",
    accent: "#e040fb",
    accent2: "#ea80fc",
    text: "#fce4ff",
    textDim: "#ce93d8",
    grain: !0,
    grainAmount: 0.06,
    grainTemp: "warm",
    shadowTint: "#080010",
    highlightTint: "#e040fb",
    vignetteStrength: 0.92,
    keyLightX: 0.45,
    keyLightY: 0.3,
  },
  live_performance: {
    bg1: "#000600",
    bg2: "#001000",
    bg3: "#000600",
    bg2Light: "#002800",
    accent: "#69ff47",
    accent2: "#b2ff59",
    text: "#f1f8e9",
    textDim: "#aed581",
    grain: !0,
    grainAmount: 0.05,
    grainTemp: "neutral",
    shadowTint: "#000800",
    highlightTint: "#69ff47",
    vignetteStrength: 0.8,
    keyLightX: 0.5,
    keyLightY: 0.25,
  },
  default: {
    bg1: "#04040c",
    bg2: "#0c0c20",
    bg3: "#04040c",
    bg2Light: "#180830",
    accent: "#7c3aed",
    accent2: "#a855f7",
    text: "#f8f8ff",
    textDim: "#9090c0",
    grain: !0,
    grainAmount: 0.04,
    grainTemp: "cool",
    shadowTint: "#04041a",
    highlightTint: "#7c3aed",
    vignetteStrength: 0.78,
    keyLightX: 0.5,
    keyLightY: 0.4,
  },
};
function st(n) {
  const r = n.template || n.template_name || "default",
    t = yn[r] || yn.default;
  return n.bgColor || n.accentColor
    ? {
        ...t,
        bg1: n.bgColor || t.bg1,
        bg2: n.bgColor || t.bg2,
        bg3: n.bgColor || t.bg3,
        bg2Light: n.bgColor || t.bg2Light,
        accent: n.accentColor || t.accent,
        accent2: n.accentColor || t.accent2,
      }
    : t;
}
const I = (n, r = 0, t = 1) => Math.max(r, Math.min(t, n)),
  _ = (n) => n * n * (3 - 2 * n),
  it = (n) => n * n * n;
function ct(n, r, t, l = 1) {
  return n < r ? _(I(n / r)) : n > t ? _(I(1 - (n - t) / (l - t))) : 1;
}
function Ae(n, r, t) {
  const l = r.split(" "),
    s = [];
  let c = "";
  for (const m of l) {
    const f = c ? `${c} ${m}` : m;
    n.measureText(f).width > t && c ? (s.push(c), (c = m)) : (c = f);
  }
  return (c && s.push(c), s);
}
function pe(n, r, t, l, s, c) {
  if (s <= 0) return l;
  (n.save(),
    (n.globalAlpha = I(s)),
    (n.font = c.font),
    (n.fillStyle = c.color),
    (n.textAlign = c.align || "center"),
    (n.textBaseline = "middle"),
    c.shadow &&
      ((n.shadowColor = c.shadow), (n.shadowBlur = c.shadowBlur || 20)));
  const m = c.slide || 0;
  if (c.maxW) {
    const f = Ae(n, r, c.maxW),
      h = c.lineH || parseFloat(c.font) * 1.3;
    return (
      f.forEach((d, v) => n.fillText(d, t + m * (1 - s), l + v * h)),
      n.restore(),
      l + f.length * h
    );
  }
  return (
    n.fillText(r, t + m * (1 - s), l),
    n.restore(),
    l + (c.lineH || parseFloat(c.font) * 1.3)
  );
}
function lt(n, r) {
  const t = n.trim().split(" "),
    l = Math.max(1, Math.ceil(r * t.length));
  return t.slice(0, l).join(" ");
}
function at(n, r, t, l = 8) {
  const s = Math.min(n, 256),
    c = Math.min(r, 256),
    m = t.grainTemp === "warm" ? 1.25 : t.grainTemp === "cool" ? 0.8 : 1,
    f = t.grainTemp === "warm" ? 0.8 : t.grainTemp === "cool" ? 1.25 : 1,
    h = t.grainAmount * 72;
  return Array.from({ length: l }, (d, v) => {
    const k = document.createElement("canvas");
    ((k.width = s), (k.height = c));
    const y = k.getContext("2d"),
      C = y.createImageData(s, c),
      u = C.data;
    let i = (v * 2654435761 + 1013904223) >>> 0;
    const w = () => (
      (i = (Math.imul(i, 1664525) + 1013904223) >>> 0),
      i / 4294967295
    );
    for (let N = 0; N < u.length; N += 4) {
      const b = Math.max(1e-10, w()),
        x = w(),
        E = 128 + Math.sqrt(-2 * Math.log(b)) * Math.cos(2 * Math.PI * x) * h;
      ((u[N] = Math.max(0, Math.min(255, Math.round(E * m)))),
        (u[N + 1] = Math.max(0, Math.min(255, Math.round(E)))),
        (u[N + 2] = Math.max(0, Math.min(255, Math.round(E * f)))),
        (u[N + 3] = 255));
    }
    return (y.putImageData(C, 0, 0), k);
  });
}
function mt(n, r, t, l, s, c) {
  if (!c.grain || l.length === 0) return;
  const m = l[s % l.length];
  (n.save(),
    (n.globalAlpha = I(c.grainAmount, 0, 1)),
    (n.globalCompositeOperation = "soft-light"));
  for (let f = 0; f < t; f += m.height)
    for (let h = 0; h < r; h += m.width) n.drawImage(m, h, f);
  n.restore();
}
function Dn(n, r, t, l, s) {
  ((n.fillStyle = l.bg1), n.fillRect(0, 0, r, t));
  const c = n.createLinearGradient(0, t * 0.55, 0, 0);
  (c.addColorStop(0, `${l.bg2}00`),
    c.addColorStop(1, `${l.bg2}70`),
    (n.fillStyle = c),
    n.fillRect(0, 0, r, t));
  const m = r * (l.keyLightX + Math.sin(s * 0.08) * 0.025),
    f = t * (l.keyLightY + Math.cos(s * 0.06) * 0.018),
    h = Math.max(r, t) * 0.72,
    d = n.createRadialGradient(m, f, 0, m, f, h);
  (d.addColorStop(0, `${l.bg2}d0`),
    d.addColorStop(0.3, `${l.bg3}80`),
    d.addColorStop(0.7, `${l.bg1}30`),
    d.addColorStop(1, `${l.bg1}00`),
    (n.fillStyle = d),
    n.fillRect(0, 0, r, t));
  const v = r * (1 - l.keyLightX + Math.cos(s * 0.07) * 0.02),
    k = t * (1 - l.keyLightY + Math.sin(s * 0.09) * 0.02),
    y = n.createRadialGradient(v, k, 0, v, k, Math.max(r, t) * 0.55);
  (y.addColorStop(0, `${l.bg2Light}50`),
    y.addColorStop(0.45, `${l.bg2Light}20`),
    y.addColorStop(1, "rgba(0,0,0,0)"),
    (n.fillStyle = y),
    n.fillRect(0, 0, r, t));
  const C = r * (0.5 + Math.sin(s * 0.13) * 0.3),
    u = t * (0.2 + Math.cos(s * 0.11) * 0.1),
    i = n.createRadialGradient(C, u, 0, C, u, r * 0.18);
  (i.addColorStop(0, `${l.bg2Light}22`),
    i.addColorStop(1, "rgba(0,0,0,0)"),
    (n.fillStyle = i),
    n.fillRect(0, 0, r, t));
}
function ut(n, r, t, l) {
  if (l <= 0) return;
  const s = r / 2,
    c = t / 2,
    m = Math.sqrt(s * s + c * c),
    f = n.createRadialGradient(s, c, m * 0.28, s, c, m * 1.18);
  (f.addColorStop(0, "rgba(0,0,0,0)"),
    f.addColorStop(0.45, `rgba(0,0,0,${(l * 0.18).toFixed(3)})`),
    f.addColorStop(0.72, `rgba(0,0,0,${(l * 0.48).toFixed(3)})`),
    f.addColorStop(1, `rgba(0,0,0,${(l * 0.82).toFixed(3)})`),
    n.save(),
    (n.globalCompositeOperation = "source-over"),
    (n.fillStyle = f),
    n.fillRect(0, 0, r, t),
    n.restore());
}
function dt(n, r, t, l, s) {
  n.save();
  const c = n.createLinearGradient(0, t * 0.42, 0, t);
  (c.addColorStop(0, `${l.shadowTint}00`),
    c.addColorStop(1, `${l.shadowTint}88`),
    (n.globalCompositeOperation = "multiply"),
    (n.fillStyle = c),
    n.fillRect(0, 0, r, t));
  const m = r * (l.keyLightX + Math.sin(s * 0.08) * 0.02),
    f = t * (l.keyLightY + Math.cos(s * 0.06) * 0.02),
    h = n.createRadialGradient(m, f, 0, m, f, Math.max(r, t) * 0.55);
  (h.addColorStop(0, `${l.highlightTint}28`),
    h.addColorStop(0.5, `${l.highlightTint}10`),
    h.addColorStop(1, "rgba(0,0,0,0)"),
    (n.globalCompositeOperation = "screen"),
    (n.fillStyle = h),
    n.fillRect(0, 0, r, t));
  const d = n.createRadialGradient(
    r / 2,
    t / 2,
    0,
    r / 2,
    t / 2,
    Math.max(r, t) * 0.6,
  );
  (d.addColorStop(0, "rgba(255,255,255,0.03)"),
    d.addColorStop(1, "rgba(0,0,0,0.06)"),
    (n.globalCompositeOperation = "overlay"),
    (n.fillStyle = d),
    n.fillRect(0, 0, r, t),
    n.restore());
}
function An(n, r, t, l, s) {
  Dn(n, r, t, l, s);
}
function Cn(n, r, t, l, s) {
  Dn(n, r, t, l, s);
}
function ht(n, r, t, l, s, c) {
  switch ((n.save(), l)) {
    case "tiktok": {
      const m = Math.max(2, t * 0.006);
      ((n.fillStyle = "rgba(255,255,255,0.2)"),
        n.fillRect(0, t - m * 4, r, m),
        (n.fillStyle = c),
        n.fillRect(0, t - m * 4, r * s, m));
      const f = r * 0.04,
        h = r - f - r * 0.04;
      for (let d = 0; d < 3; d++)
        (n.beginPath(),
          n.arc(h, t * 0.55 + d * f * 2.8, f, 0, Math.PI * 2),
          (n.fillStyle = "rgba(255,255,255,0.15)"),
          n.fill());
      break;
    }
    case "instagram": {
      ((n.strokeStyle = c),
        (n.lineWidth = Math.max(2, r * 0.006)),
        (n.globalAlpha = 0.5),
        n.beginPath(),
        n.arc(r * 0.5, t * 0.06, r * 0.055, 0, Math.PI * 2 * s),
        n.stroke());
      break;
    }
    case "youtube": {
      const m = t * 0.04;
      ((n.fillStyle = "rgba(0,0,0,0.7)"),
        n.fillRect(0, 0, r, m),
        n.fillRect(0, t - m, r, m));
      break;
    }
  }
  n.restore();
}
function Nt(n, r, t, l, s, c, m, f) {
  An(n, r, t, s, m);
  const h = r / 2,
    d = t / 2;
  for (let i = 0; i < 4; i++) {
    const w = I(c * 1.5 - i * 0.15),
      N = w * Math.min(r, t) * (0.25 + i * 0.08),
      b = (1 - w) * (0.35 - i * 0.06);
    b <= 0 ||
      (n.save(),
      (n.globalAlpha = b),
      (n.strokeStyle = s.accent),
      (n.lineWidth = Math.max(1, (4 - i) * r * 0.003)),
      n.beginPath(),
      n.arc(h, d, N, 0, Math.PI * 2),
      n.stroke(),
      n.restore());
  }
  const v = I((c - 0.1) * 3);
  if (v > 0) {
    const i = r * 0.3 * _(I((c - 0.1) * 4));
    (n.save(),
      (n.globalAlpha = v),
      (n.fillStyle = s.accent),
      n.fillRect(h - i / 2, d - t * 0.01, i, t * 0.003),
      n.restore());
  }
  const k = I((c - 0.2) * 4),
    y = l.artistName || l.topic || "";
  if (y && k > 0) {
    const i = Math.round(f * 1.1);
    pe(n, y.toUpperCase(), h, d + t * 0.07, k, {
      font: `700 ${i}px 'Inter', system-ui, sans-serif`,
      color: s.text,
      shadow: s.accent,
      shadowBlur: 30,
      slide: r * 0.05,
    });
  }
  const C = I((c - 0.35) * 3),
    u = l.hook ? l.hook.split(" ").slice(0, 5).join(" ") : "NEW RELEASE";
  if (C > 0) {
    const i = Math.round(f * 0.55);
    pe(n, u.toUpperCase(), h, d + t * 0.14, C * 0.7, {
      font: `400 ${i}px 'Inter', system-ui, sans-serif`,
      color: s.textDim,
      slide: r * 0.03,
    });
  }
}
function pt(n, r, t, l, s, c, m, f, h) {
  Cn(n, r, t, s, m);
  const d = r / 2,
    v = t > r;
  if (h === "cinematic_promo" || h === "artist_spotlight") {
    const j = t * 0.08,
      o = _(I(c * 3));
    (n.save(),
      (n.globalAlpha = o * 0.9),
      (n.fillStyle = "#000000"),
      n.fillRect(0, 0, r, j),
      n.fillRect(0, t - j, r, j),
      n.restore());
    const p = r * (0.2 + Math.sin(m * 0.4) * 0.15),
      A = n.createRadialGradient(p, 0, 0, p, 0, t * 1.2);
    (A.addColorStop(0, "rgba(255,240,200,0.12)"),
      A.addColorStop(0.4, "rgba(255,220,100,0.04)"),
      A.addColorStop(1, "rgba(0,0,0,0)"),
      (n.fillStyle = A),
      n.fillRect(0, 0, r, t));
  }
  if (h === "music_visualizer") {
    const o = r / 32;
    (n.save(), (n.globalAlpha = 0.18));
    for (let p = 0; p < 32; p++) {
      const A = t * (0.1 + Math.abs(Math.sin(p * 1.3 + m * 4)) * 0.35),
        F = n.createLinearGradient(0, t, 0, t - A);
      (F.addColorStop(0, s.accent2),
        F.addColorStop(1, "transparent"),
        (n.fillStyle = F),
        n.fillRect(p * o, t - A, o - 2, A));
    }
    n.restore();
  }
  if (h === "lyric_video") {
    const j = n.createRadialGradient(d, t * 0.42, 0, d, t * 0.42, r * 0.5);
    (j.addColorStop(0, `${s.accent}28`),
      j.addColorStop(1, "transparent"),
      (n.fillStyle = j),
      n.fillRect(0, 0, r, t));
  }
  const k = l.hook || l.topic || "Your Sound. Your Story.",
    y = _(I(c * 1.8)),
    C = lt(k, y),
    u = _(I(c * 3)),
    i = Math.round(f * (v ? 1.5 : 1.3)),
    w = v ? t * 0.38 : t * 0.4,
    N = r * 0.08;
  (n.save(),
    (n.globalAlpha = u),
    (n.font = `900 ${i}px 'Inter', system-ui, sans-serif`),
    (n.fillStyle = s.text),
    (n.textAlign = "center"),
    (n.textBaseline = "middle"),
    (n.shadowColor = s.accent),
    (n.shadowBlur = 40));
  const b = Ae(n, C.toUpperCase(), r - N * 2),
    x = i * 1.15,
    g = b.length * x;
  if (
    (b.forEach((j, o) => {
      n.fillText(j, d, w - g / 2 + o * x);
    }),
    n.restore(),
    u > 0.5)
  ) {
    const j = n.measureText(b[b.length - 1] || "").width,
      o = w + g / 2 + i * 0.2,
      p = _(I((c - 0.3) * 3)),
      A = j * _(I((c - 0.3) * 4));
    (n.save(),
      (n.globalAlpha = p),
      (n.fillStyle = s.accent),
      n.fillRect(d - A / 2, o, A, Math.max(2, i * 0.04)),
      n.restore());
  }
  const E = l.artistName || "";
  if (E) {
    const j = Math.round(f * 0.5);
    pe(n, E, r - r * 0.06, t - t * 0.04, u * 0.45, {
      font: `500 ${j}px 'Inter', system-ui, sans-serif`,
      color: s.textDim,
      align: "right",
    });
  }
}
function ft(n, r, t, l, s, c, m, f, h) {
  Cn(n, r, t, s, m);
  const d = r / 2,
    v = t > r;
  if (h === "music_visualizer") {
    const i = (r * 0.85) / 48,
      w = r * 0.075,
      N = t * 0.35,
      b = t * (v ? 0.72 : 0.7);
    for (let x = 0; x < 48; x++) {
      const E =
          Math.abs(
            Math.sin(x * 0.4 + m * 6) * 0.5 +
              Math.sin(x * 0.15 + m * 3.7) * 0.3 +
              Math.sin(x * 0.07 + m * 1.8) * 0.2,
          ) *
          N *
          _(I(c * 2)),
        j = n.createLinearGradient(0, b, 0, b - E);
      (j.addColorStop(0, s.accent + "40"),
        j.addColorStop(0.6, s.accent),
        j.addColorStop(1, s.accent2),
        (n.fillStyle = j));
      const o = w + x * (i + 1);
      n.fillRect(o, b - E, i, E);
    }
  }
  if (h === "album_promo") {
    const u = Math.min(r, t) * (v ? 0.22 : 0.28),
      i = v ? d : r * 0.72,
      w = v ? t * 0.35 : t * 0.5,
      N = m * 1.5;
    (n.save(),
      n.translate(i, w),
      n.rotate(N),
      n.beginPath(),
      n.arc(0, 0, u, 0, Math.PI * 2),
      (n.fillStyle = "#111"),
      n.fill(),
      (n.globalAlpha = 0.5));
    for (let g = 1; g <= 6; g++)
      (n.beginPath(),
        n.arc(0, 0, u * (0.4 + g * 0.09), 0, Math.PI * 2),
        (n.strokeStyle = "#333"),
        (n.lineWidth = 1),
        n.stroke());
    n.globalAlpha = 1;
    const b = u * 0.28;
    (n.beginPath(),
      n.arc(0, 0, b, 0, Math.PI * 2),
      (n.fillStyle = s.accent),
      n.fill(),
      n.beginPath(),
      n.arc(0, 0, u * 0.03, 0, Math.PI * 2),
      (n.fillStyle = "#000"),
      n.fill(),
      n.restore(),
      n.save());
    const x = n.createLinearGradient(i - u, w - u, i + u * 0.3, w + u * 0.3);
    (x.addColorStop(0, "rgba(255,255,255,0.08)"),
      x.addColorStop(0.5, "rgba(255,255,255,0)"),
      (n.fillStyle = x),
      n.beginPath(),
      n.arc(i, w, u, 0, Math.PI * 2),
      n.fill(),
      n.restore());
  }
  if (h === "live_performance") {
    for (let w = 0; w < 5; w++) {
      const N = r * (0.1 + (w / 4) * 0.8),
        b = (0.06 + Math.abs(Math.sin(m * 1.2 + w)) * 0.06) * _(I(c * 2)),
        x = n.createLinearGradient(N, 0, N, t * 0.75);
      (x.addColorStop(
        0,
        `${w % 2 === 0 ? s.accent : s.accent2}${Math.round(b * 255)
          .toString(16)
          .padStart(2, "0")}`,
      ),
        x.addColorStop(1, "transparent"),
        (n.fillStyle = x),
        n.save(),
        n.beginPath());
      const g = r * 0.08;
      (n.moveTo(N - g * 0.1, 0),
        n.lineTo(N + g * 0.1, 0),
        n.lineTo(N + g, t * 0.75),
        n.lineTo(N - g, t * 0.75),
        n.closePath(),
        n.fill(),
        n.restore());
    }
    const i = 60;
    (n.save(), (n.globalAlpha = 0.15 * _(I((c - 0.2) * 3))));
    for (let w = 0; w < i; w++) {
      const N = (w / i) * r,
        b = t * (0.78 + Math.sin(w * 7.3) * 0.06),
        x = r * 0.008 + Math.abs(Math.sin(w * 2.1 + m * 3)) * r * 0.006;
      (n.beginPath(),
        n.arc(N, b, x, 0, Math.PI * 2),
        (n.fillStyle = s.text),
        n.fill());
    }
    n.restore();
  }
  if (h === "artist_spotlight") {
    const u = n.createLinearGradient(d, 0, d, t * 0.7);
    (u.addColorStop(0, `${s.accent}30`),
      u.addColorStop(1, "transparent"),
      n.save());
    const i = r * 0.3;
    (n.beginPath(),
      n.moveTo(d - r * 0.02, 0),
      n.lineTo(d + r * 0.02, 0),
      n.lineTo(d + i, t * 0.7),
      n.lineTo(d - i, t * 0.7),
      n.closePath(),
      (n.fillStyle = u),
      n.fill(),
      n.restore());
  }
  const k = l.body || "",
    y = ct(c, 0.15, 0.85);
  if (k && y > 0) {
    const u = Math.round(f * 0.78),
      i = v ? t * 0.58 : t * 0.55,
      w = r * 0.1;
    (n.save(),
      (n.globalAlpha = y),
      (n.font = `400 ${u}px 'Inter', system-ui, sans-serif`),
      (n.fillStyle = s.text),
      (n.textAlign = "center"),
      (n.textBaseline = "middle"),
      (n.shadowColor = s.bg1),
      (n.shadowBlur = 10));
    const N = Ae(n, k, r - w * 2),
      b = u * 1.55;
    (N.slice(0, 3).forEach((x, g) => {
      const E = _(I((c - 0.12 - g * 0.08) * 5));
      ((n.globalAlpha = y * E), n.fillText(x, d, i + g * b));
    }),
      n.restore());
  }
  if (h === "lyric_video") {
    const u = _(I(c * 2)) * 0.3;
    (n.save(),
      (n.globalAlpha = u),
      (n.strokeStyle = s.accent),
      (n.lineWidth = 1));
    for (let i = 0; i < 3; i++) {
      const w = t * (0.25 + i * 0.15) + Math.sin(m * 1.5 + i) * t * 0.01;
      ((n.globalAlpha = u * (1 - i * 0.25)),
        n.beginPath(),
        n.moveTo(0, w),
        n.lineTo(r, w),
        n.stroke());
    }
    n.restore();
  }
  const C = l.hook || "";
  if (C) {
    const u = _(I(c * 2)) * 0.5,
      i = Math.round(f * 0.5);
    pe(n, C.split(" ").slice(0, 5).join(" ").toUpperCase(), d, t * 0.08, u, {
      font: `700 ${i}px 'Inter', system-ui, sans-serif`,
      color: s.accent,
    });
  }
}
function bt(n, r, t, l, s, c, m, f) {
  An(n, r, t, s, m);
  const h = r / 2,
    d = t > r,
    v = Math.min(r, t) * (0.3 + Math.sin(m * 2) * 0.05),
    k = n.createRadialGradient(h, t * 0.5, 0, h, t * 0.5, v);
  (k.addColorStop(0, `${s.accent}25`),
    k.addColorStop(1, "transparent"),
    (n.fillStyle = k),
    n.fillRect(0, 0, r, t));
  const y = l.hook || l.topic || "";
  if (y) {
    const N = _(I(c * 3)),
      b = Math.round(f * 0.9),
      x = d ? t * 0.3 : t * 0.28;
    (n.save(),
      (n.globalAlpha = N),
      (n.font = `800 ${b}px 'Inter', system-ui, sans-serif`),
      (n.fillStyle = s.text),
      (n.textAlign = "center"),
      (n.textBaseline = "middle"),
      (n.shadowColor = s.accent),
      (n.shadowBlur = 25),
      Ae(n, y.toUpperCase(), r * 0.8)
        .slice(0, 2)
        .forEach((E, j) => n.fillText(E, h, x + j * b * 1.2)),
      n.restore());
  }
  const C = l.cta || "Listen Now",
    u = _(I((c - 0.2) * 4));
  if (u > 0) {
    const N = Math.min(r * 0.72, 380 * (r / 1080)),
      b = f * 2.4,
      x = h - N / 2,
      g = d ? t * 0.55 : t * 0.52,
      E = b / 2,
      j = 1 + Math.sin(m * 3) * 0.04;
    (n.save(),
      (n.globalAlpha = u * 0.35),
      (n.strokeStyle = s.accent),
      (n.lineWidth = Math.max(1, r * 0.005)),
      n.beginPath(),
      n.ellipse(
        h,
        g,
        (N / 2) * j + b * 0.3,
        (b / 2) * j + b * 0.3,
        0,
        0,
        Math.PI * 2,
      ),
      n.stroke(),
      n.restore());
    const o = n.createLinearGradient(x, g - b / 2, x + N, g + b / 2);
    (o.addColorStop(0, s.accent),
      o.addColorStop(1, s.accent2),
      n.save(),
      (n.globalAlpha = u),
      (n.shadowColor = s.accent),
      (n.shadowBlur = 30),
      n.beginPath(),
      n.moveTo(x + E, g - b / 2),
      n.lineTo(x + N - E, g - b / 2),
      n.arcTo(x + N, g - b / 2, x + N, g, E),
      n.lineTo(x + N, g + b / 2 - E),
      n.arcTo(x + N, g + b / 2, x + N - E, g + b / 2, E),
      n.lineTo(x + E, g + b / 2),
      n.arcTo(x, g + b / 2, x, g, E),
      n.lineTo(x, g - b / 2 + E),
      n.arcTo(x, g - b / 2, x + E, g - b / 2, E),
      n.closePath(),
      (n.fillStyle = o),
      n.fill(),
      (n.shadowBlur = 0),
      (n.font = `700 ${Math.round(f * 0.78)}px 'Inter', system-ui, sans-serif`),
      (n.fillStyle = "#ffffff"),
      (n.textAlign = "center"),
      (n.textBaseline = "middle"),
      n.fillText(C, h, g),
      n.restore());
  }
  const i = l.artistName || "";
  if (i) {
    const N = _(I((c - 0.35) * 3)) * 0.65,
      b = Math.round(f * 0.52);
    pe(n, i, h, d ? t * 0.74 : t * 0.72, N, {
      font: `600 ${b}px 'Inter', system-ui, sans-serif`,
      color: s.textDim,
    });
  }
  const w = l.hashtags?.slice(0, 5) || [];
  if (w.length > 0) {
    const N = _(I((c - 0.45) * 3)) * 0.7,
      b = Math.round(f * 0.42),
      x = w.join("  "),
      g = d ? t * 0.83 : t * 0.81;
    (n.save(),
      (n.globalAlpha = N),
      (n.font = `500 ${b}px 'Inter', system-ui, sans-serif`),
      (n.fillStyle = s.accent),
      (n.textAlign = "center"),
      (n.textBaseline = "middle"),
      (n.shadowColor = s.accent),
      (n.shadowBlur = 8),
      n.fillText(x, h, g),
      n.restore());
  }
}
function xt(n, r, t, l, s, c, m, f) {
  ((n.fillStyle = s.bg1), n.fillRect(0, 0, r, t));
  const h = (1 - c) * 0.5,
    d = n.createRadialGradient(
      r / 2,
      t / 2,
      0,
      r / 2,
      t / 2,
      Math.min(r, t) * 0.4,
    );
  (d.addColorStop(
    0,
    `${s.accent}${Math.round(h * 255)
      .toString(16)
      .padStart(2, "0")}`,
  ),
    d.addColorStop(1, "transparent"),
    (n.fillStyle = d),
    n.fillRect(0, 0, r, t));
  for (let y = 0; y < 3; y++) {
    const C = I(c + y * 0.15),
      i = Math.min(r, t) * (0.35 - y * 0.06) * (1 - it(C));
    i <= 0 ||
      (n.save(),
      (n.globalAlpha = (1 - C) * 0.4),
      (n.strokeStyle = s.accent),
      (n.lineWidth = Math.max(1, r * 0.004)),
      n.beginPath(),
      n.arc(r / 2, t / 2, i, 0, Math.PI * 2),
      n.stroke(),
      n.restore());
  }
  const v = l.artistName || "",
    k = _(I(1 - c * 1.5));
  if (v && k > 0) {
    const y = Math.round(f * 0.9);
    pe(n, v.toUpperCase(), r / 2, t / 2, k, {
      font: `700 ${y}px 'Inter', system-ui, sans-serif`,
      color: s.text,
      shadow: s.accent,
      shadowBlur: 20,
    });
  }
}
function vt(n, r, t, l, s, c) {
  return [
    {
      start: 0,
      end: 0.14,
      draw: (m, f, h, d, v) => Nt(m, n, r, t, l, d, v, s),
    },
    {
      start: 0.1,
      end: 0.44,
      draw: (m, f, h, d, v) => pt(m, n, r, t, l, d, v, s, c),
    },
    {
      start: 0.38,
      end: 0.7,
      draw: (m, f, h, d, v) => ft(m, n, r, t, l, d, v, s, c),
    },
    {
      start: 0.64,
      end: 0.88,
      draw: (m, f, h, d, v) => bt(m, n, r, t, l, d, v, s),
    },
    {
      start: 0.84,
      end: 1,
      draw: (m, f, h, d, v) => xt(m, n, r, t, l, d, v, s),
    },
  ];
}
function kn(n, r) {
  const { start: t, end: l } = n,
    s = l - t;
  if (r < t || r > l) return 0;
  const c = (r - t) / s,
    m = Math.min(0.15, s * 0.3),
    f = c < m / s ? c / (m / s) : 1,
    h = c > 1 - m / s ? (1 - c) / (m / s) : 1;
  return Math.min(f, h);
}
function gt(n, r, t, l, s, c, m, f, h, d) {
  l.template || l.template_name;
  let v = c[0],
    k = 0;
  for (const i of c) {
    const w = kn(i, m);
    w > k && ((k = w), (v = i));
  }
  const y = v.start,
    C = v.end,
    u = C > y ? (m - y) / (C - y) : 0;
  v.draw(n, r, t, I(u), f);
  for (const i of c) {
    if (i === v) continue;
    const w = kn(i, m);
    if (w <= 0.02) continue;
    const N = i.start,
      b = i.end,
      x = b > N ? (m - N) / (b - N) : 0,
      g = document.createElement("canvas");
    ((g.width = r), (g.height = t));
    const E = g.getContext("2d");
    (i.draw(E, r, t, I(x), f),
      n.save(),
      (n.globalAlpha = w),
      n.drawImage(g, 0, 0),
      n.restore());
  }
  (ht(n, r, t, l.platform || "", m, s.accent),
    dt(n, r, t, s, f),
    ut(n, r, t, s.vignetteStrength),
    d && mt(n, r, t, d, Math.floor(f * h), s),
    m < 0.04 &&
      ((n.fillStyle = "#000"),
      (n.globalAlpha = 1 - m / 0.04),
      n.fillRect(0, 0, r, t),
      (n.globalAlpha = 1)),
    m > 0.94 &&
      ((n.fillStyle = "#000"),
      (n.globalAlpha = (m - 0.94) / 0.06),
      n.fillRect(0, 0, r, t),
      (n.globalAlpha = 1)));
}
async function wt(n, r = {}) {
  const { fps: t = 30, onProgress: l, signal: s } = r,
    c = Math.max(3, Math.min(60, n.duration || 10)),
    m = n.width || (n.aspect_ratio === "16:9" ? 1920 : 1080),
    f = n.height || (n.aspect_ratio === "16:9" ? 1080 : 1920),
    h = Math.min(1, 1280 / Math.max(m, f)),
    d = Math.round(m * h),
    v = Math.round(f * h),
    k = st(n),
    y = Math.max(14, Math.round(d * 0.045)),
    C = n.template || n.template_name || "default",
    u = Math.ceil(c * t),
    i = vt(d, v, n, k, y, C),
    N =
      [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ].find((R) => MediaRecorder.isTypeSupported(R)) || "video/webm",
    b = document.createElement("canvas");
  ((b.width = d), (b.height = v));
  const x = b.getContext("2d"),
    g = k.grain ? at(d, v, k) : [],
    E = b.captureStream(t),
    j = [],
    o = Math.min(2e7, d * v * t * 0.14),
    p = new MediaRecorder(E, { mimeType: N, videoBitsPerSecond: o });
  p.ondataavailable = (R) => {
    R.data.size > 0 && j.push(R.data);
  };
  const A = new Promise((R, H) => {
    ((p.onstop = () => R(new Blob(j, { type: N }))),
      (p.onerror = (oe) =>
        H(
          new Error(`MediaRecorder error: ${oe.error?.message || "unknown"}`),
        )));
  });
  p.start(100);
  const F = 1e3 / t;
  for (let R = 0; R <= u; R++) {
    if (s?.aborted) throw (p.stop(), new Error("Render aborted"));
    const H = performance.now(),
      oe = R / u,
      se = R / t;
    (gt(x, d, v, n, k, i, oe, se, t, g), l?.(Math.round(oe * 95)));
    const Ce = performance.now() - H,
      fe = Math.max(0, F - Ce);
    await new Promise((Se) => setTimeout(Se, fe));
  }
  p.stop();
  const de = await A;
  l?.(100);
  const re = URL.createObjectURL(de);
  return {
    blobUrl: re,
    mimeType: N,
    duration: c,
    width: d,
    height: v,
    revoke: () => URL.revokeObjectURL(re),
  };
}
function En(n) {
  return n instanceof Error ? n.message : String(n ?? "");
}
function Vt(n) {
  return n instanceof Error ? n.name : void 0;
}
const yt = [
    {
      id: "cinematic_promo",
      name: "Cinematic Promo",
      description: "Film-quality dramatic lighting",
      category: "promo",
      color: "#e94560",
      icon: ie,
    },
    {
      id: "neon_pulse",
      name: "Neon Pulse",
      description: "Vibrant plasma energy",
      category: "energetic",
      color: "#ff6ec7",
      icon: Ve,
    },
    {
      id: "dark_cinema",
      name: "Dark Cinema",
      description: "Moody atmospheric film",
      category: "dramatic",
      color: "#1a1a2e",
      icon: ie,
    },
    {
      id: "aurora",
      name: "Aurora",
      description: "Northern lights waves",
      category: "atmospheric",
      color: "#40e0d0",
      icon: Z,
    },
    {
      id: "music_video",
      name: "Music Video",
      description: "High-energy bold colors",
      category: "music",
      color: "#ff00ff",
      icon: Ve,
    },
    {
      id: "gold_luxury",
      name: "Gold Luxury",
      description: "Premium gold aesthetic",
      category: "luxury",
      color: "#d4af37",
      icon: Z,
    },
    {
      id: "elegant_minimal",
      name: "Elegant",
      description: "Clean sophisticated",
      category: "professional",
      color: "#8b7355",
      icon: Xe,
    },
    {
      id: "vintage_film",
      name: "Vintage Film",
      description: "Retro 8mm aesthetic",
      category: "retro",
      color: "#5c4033",
      icon: ie,
    },
    {
      id: "ocean_wave",
      name: "Ocean Wave",
      description: "Calming ocean gradients",
      category: "calm",
      color: "#006994",
      icon: Z,
    },
    {
      id: "fire_ember",
      name: "Fire & Ember",
      description: "Intense warm tones",
      category: "intense",
      color: "#ff4500",
      icon: Ve,
    },
    {
      id: "storyteller",
      name: "Storyteller",
      description: "Narrative progression",
      category: "narrative",
      color: "#2d2d44",
      icon: $e,
    },
  ],
  kt = [
    { id: "9:16", name: "Vertical (9:16)", hint: "TikTok, Reels, Shorts" },
    { id: "16:9", name: "Landscape (16:9)", hint: "YouTube, Twitter" },
    { id: "1:1", name: "Square (1:1)", hint: "Instagram, Facebook" },
    { id: "4:5", name: "Portrait (4:5)", hint: "Instagram, Facebook" },
  ],
  jn = {
    tiktok: "9:16",
    instagram: "1:1",
    youtube: "16:9",
    facebook: "1:1",
    twitter: "16:9",
    linkedin: "16:9",
    google_business: "16:9",
    threads: "1:1",
  },
  Et = {
    tiktok: "neon_pulse",
    instagram: "cinematic_promo",
    instagram_reels: "neon_pulse",
    youtube: "dark_cinema",
    facebook: "announcement",
    twitter: "promo",
    linkedin: "elegant_minimal",
    threads: "storyteller",
    google_business: "gold_luxury",
  };
function Gt({
  platform: n,
  topic: r,
  tone: t = "energetic",
  goal: l = "growth",
  artistName: s = "",
  onVideoGenerated: c,
  onImportToStudio: m,
  className: f = "",
  initialHook: h = "",
  initialBody: d = "",
  initialCta: v = "",
  initialTemplate: k = "",
  initialBgColor: y = "",
  initialAccentColor: C = "",
  autoStart: u = !1,
}) {
  const { toast: i } = He(),
    [, w] = qn(),
    [N, b] = V.useState("text"),
    x = V.useRef(!1),
    [g, E] = V.useState(u && !!(r?.trim() || h?.trim())),
    [j, o] = V.useState(""),
    [p, A] = V.useState(h),
    [F, de] = V.useState(d),
    [re, R] = V.useState(v),
    [H, oe] = V.useState(!!(h || d || v)),
    [se, Ce] = V.useState(!!k),
    [fe, Se] = V.useState(k || "cinematic_promo"),
    [le, en] = V.useState(null),
    [U, Ge] = V.useState(null),
    [nn, tn] = V.useState(!1),
    [ye, rn] = V.useState(null),
    [ee, on] = V.useState(null),
    [B, ze] = V.useState(null),
    [sn, cn] = V.useState(!1),
    [he, Sn] = V.useState(!1),
    [Ie, ln] = V.useState(jn[n] || "9:16"),
    [ke, Gn] = V.useState(10),
    [be, zn] = V.useState(s),
    [ne, Te] = V.useState(!1),
    [te, ae] = V.useState(""),
    [J, Me] = V.useState(null),
    [T, _e] = V.useState(null),
    [an, mn] = V.useState(0),
    me = V.useRef(null),
    un = V.useRef(null),
    dn = V.useRef(null),
    Re = V.useRef(null),
    xe = V.useRef(!1),
    [q, Ee] = V.useState(0),
    ve = V.useRef(null);
  (V.useEffect(() => {
    ln(jn[n] || "9:16");
  }, [n]),
    V.useEffect(() => {
      r && !j && o(r);
    }, [r]),
    V.useEffect(() => {
      const a = () => {
        const S = ve.current;
        !S ||
          document.visibilityState !== "visible" ||
          fetch(`/api/social/video-job/${S}`, { credentials: "include" })
            .then((z) => z.json())
            .then((z) => {
              const M = z.url || z.video_url;
              (z.status === "done" || z.status === "completed") &&
                M &&
                ((ve.current = null),
                hn({ ...z, url: M }),
                Te(!1),
                ae(""),
                Ee(0));
            })
            .catch(() => {});
      };
      return (
        document.addEventListener("visibilitychange", a),
        () => document.removeEventListener("visibilitychange", a)
      );
    }, []),
    V.useEffect(
      () => () => {
        ee && URL.revokeObjectURL(ee);
      },
      [ee],
    ),
    V.useEffect(
      () => () => {
        me.current && (URL.revokeObjectURL(me.current), (me.current = null));
      },
      [],
    ));
  const hn = (a) => {
      const S = a.url ?? a.video_url ?? "";
      (Me(S || null),
        _e({
          hook: a.hook,
          body: a.body,
          cta: a.cta,
          source: a.source,
          width: a.width,
          height: a.height,
          processingTime: Math.round(a.processing_time_ms ?? 0),
          renderTime: Math.round(a.render_time_ms ?? 0),
          scenesRendered: a.scenes_rendered ?? 1,
          templateName: a.template_name ?? a.template,
          quality: a.quality,
          hashtags: a.hashtags ?? [],
          contentConfidence: a.content_confidence ?? null,
          sentimentScore: a.sentiment_score ?? null,
          sentimentLabel: a.sentiment_label ?? null,
        }),
        S && c(S));
    },
    In = async (a) => {
      ve.current = a;
      const S = 90;
      let z = 0;
      for (let M = 0; M < S; M++) {
        if ((await new Promise((P) => setTimeout(P, 2e3)), xe.current))
          throw new Error("Cancelled");
        try {
          const W = await (
            await fetch(`/api/social/video-job/${a}`, {
              credentials: "include",
            })
          ).text();
          let O;
          try {
            O = JSON.parse(W);
          } catch {
            throw new Error("Unexpected response from server");
          }
          z = 0;
          const G = O.url || O.video_url;
          if ((O.status === "done" || O.status === "completed") && G)
            return ((ve.current = null), { ...O, success: !0, url: G });
          if (O.status === "error")
            throw new Error(O.error || "Video generation failed");
          ae(`Rendering… (${Math.round((M + 1) * 2)}s)`);
        } catch (P) {
          const W = En(P);
          if (W === "Cancelled" || W === "Video generation failed") throw P;
          if ((z++, z >= 5))
            throw new Error(
              "Network error during video generation. Please check your connection.",
            );
          await new Promise((O) => setTimeout(O, 1e3 * z));
        }
      }
      throw new Error("Video generation timed out. Please try again.");
    },
    je = async (a) => {
      (Te(!0), ae("Starting…"), Me(null), _e(null), (xe.current = !1));
      const S = new AbortController();
      Re.current = S;
      const z = setTimeout(() => S.abort(), 45 * 1e3);
      Ee(0);
      const M = setInterval(() => Ee((P) => P + 1), 1e3);
      try {
        const P = Le(),
          W = await fetch("/api/social/generate-video", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(P ? { "x-csrf-token": P } : {}),
            },
            credentials: "include",
            signal: S.signal,
            body: JSON.stringify({
              platform: n,
              aspect_ratio: Ie,
              duration: ke,
              tone: t,
              goal: l,
              artist_name: be || void 0,
              ...a,
            }),
          }),
          O = await W.text();
        let G;
        try {
          G = JSON.parse(O);
        } catch {
          throw new Error(
            W.ok ? "Invalid server response" : `Server error (${W.status})`,
          );
        }
        if (W.status === 401) {
          (i({
            title: "Session expired",
            description: "Please sign in again to continue.",
            variant: "destructive",
          }),
            w(
              `/login?redirect=${encodeURIComponent(window.location.pathname)}`,
            ));
          return;
        }
        if (!W.ok)
          throw new Error(G?.message || G?.error || "Video generation failed");
        if (
          (G.job_id &&
            G.status === "processing" &&
            (ae("Rendering frames…"), (G = await In(G.job_id))),
          G.success && G.url)
        ) {
          (ae("Compositing video…"), mn(0), clearTimeout(z));
          const Nn = Math.max(10, (G.duration || ke || 10) * 2 + 30),
            pn = new AbortController(),
            On = setTimeout(() => pn.abort(), Nn * 1e3);
          me.current && (URL.revokeObjectURL(me.current), (me.current = null));
          const Yn = {
              hook: G.hook || p || void 0,
              body: G.body || F || void 0,
              cta: G.cta || re || void 0,
              topic: G.topic || j || r || void 0,
              template: G.template || G.template_name || fe || void 0,
              template_name: G.template_name || void 0,
              width: G.width || void 0,
              height: G.height || void 0,
              duration: G.duration || ke || 10,
              aspect_ratio: G.aspect_ratio || Ie || void 0,
              platform: G.platform || n || void 0,
              artistName: be || void 0,
              bgColor: y || void 0,
              accentColor: C || void 0,
              hashtags: G.hashtags || void 0,
              content_confidence: G.content_confidence ?? void 0,
              sentiment_score: G.sentiment_score ?? void 0,
              sentiment_label: G.sentiment_label ?? void 0,
            },
            ue = await wt(Yn, {
              fps: 30,
              onProgress: (fn) => {
                (mn(fn), ae(`Compositing… ${fn}%`));
              },
              signal: pn.signal,
            }).finally(() => clearTimeout(On));
          ((me.current = ue.blobUrl),
            hn({ ...G, url: ue.blobUrl, width: ue.width, height: ue.height }),
            i({
              title: "Video Ready",
              description: `${ue.width}×${ue.height} · ${ue.duration}s promotional video`,
            }));
        } else throw new Error(G.error || "Video generation failed");
      } catch (P) {
        const W = En(P);
        if (Vt(P) === "AbortError")
          xe.current
            ? i({
                title: "Cancelled",
                description: "Video generation was cancelled.",
              })
            : i({
                title: "Generation Timed Out",
                description:
                  "The server didn't respond in time. Please try again.",
                variant: "destructive",
              });
        else {
          const O = W.includes("restarted");
          i({
            title: O ? "Server Restarted" : "Generation Failed",
            description: W || "Could not generate video",
            variant: "destructive",
          });
        }
        u && (x.current = !1);
      } finally {
        (clearTimeout(z),
          clearInterval(M),
          (Re.current = null),
          (xe.current = !1),
          (ve.current = null),
          Te(!1),
          ae(""),
          Ee(0));
      }
    };
  V.useEffect(() => {
    if (!u || x.current || !!!(r?.trim() || h?.trim())) return;
    x.current = !0;
    const S = setTimeout(() => {
      E(!1);
      const z = !!(h?.trim() || d?.trim() || v?.trim()),
        M = Et[n] || "cinematic_promo",
        P = k || M;
      je({
        topic: r?.trim() || h?.trim(),
        hook: h || void 0,
        body: d || void 0,
        cta: v || void 0,
        template: P,
        quality: "cinematic",
        bg_color: y || void 0,
        accent_color: C || void 0,
        voiceover: z,
      });
    }, 100);
    return () => {
      (clearTimeout(S), (x.current = !1));
    };
  }, []);
  const Tn = async () => {
      const a = j.trim() || r.trim();
      if (!a && !p) {
        i({
          title: "Content Required",
          description: "Enter a topic or hook text.",
          variant: "destructive",
        });
        return;
      }
      await je({
        topic: a || p,
        hook: p || void 0,
        body: F || void 0,
        cta: re || void 0,
        template: se ? fe : void 0,
        quality: se ? "cinematic" : void 0,
        bg_color: y || void 0,
        accent_color: C || void 0,
        voiceover: he,
      });
    },
    Mn = (a) => {
      const S = a.target.files?.[0];
      S && (en(S), Ge(null));
    },
    _n = async () => {
      if (le) {
        tn(!0);
        try {
          const a = new FormData();
          (a.append("audio", le), a.append("platform", n));
          const S = Le(),
            z = await fetch("/api/social/analyze-audio", {
              method: "POST",
              credentials: "include",
              headers: S ? { "x-csrf-token": S } : {},
              body: a,
            }),
            M = await z.json();
          if (!z.ok || !M.success)
            throw new Error(M.message || "Audio analysis failed");
          (Ge(M),
            i({
              title: "Audio Analyzed",
              description: `Detected: ${M.analysis?.genre || "music"} — ${M.analysis?.tempo ? Math.round(M.analysis.tempo) + " BPM" : ""}`,
            }));
        } catch (a) {
          i({
            title: "Analysis Failed",
            description: a.message,
            variant: "destructive",
          });
        } finally {
          tn(!1);
        }
      }
    },
    Rn = async () => {
      if (!U) {
        i({
          title: "Analyze First",
          description: "Analyze your audio file before generating.",
          variant: "destructive",
        });
        return;
      }
      const a = U.video_config || {};
      await je({
        topic: a.topic || U.seed?.topic || "music",
        tone: a.tone || t,
        bg_color: a.bg,
        accent_color: a.ac,
        voiceover: he,
      });
    },
    Ln = (a) => {
      const S = a.target.files?.[0];
      S &&
        (rn(S),
        ze(null),
        ee && URL.revokeObjectURL(ee),
        on(URL.createObjectURL(S)));
    },
    Pn = async () => {
      if (ye) {
        cn(!0);
        try {
          const a = new FormData();
          (a.append("image", ye),
            a.append("platform", n),
            be && a.append("artist_name", be));
          const S = Le(),
            z = await fetch("/api/social/analyze-image", {
              method: "POST",
              credentials: "include",
              headers: S ? { "x-csrf-token": S } : {},
              body: a,
            }),
            M = await z.json();
          if (!z.ok || !M.success)
            throw new Error(M.message || "Image analysis failed");
          (ze(M),
            i({
              title: "Image Analyzed",
              description: `Mood: ${M.analysis?.mood || "detected"} — colors extracted`,
            }));
        } catch (a) {
          i({
            title: "Analysis Failed",
            description: a.message,
            variant: "destructive",
          });
        } finally {
          cn(!1);
        }
      }
    },
    $n = async () => {
      if (!B) {
        i({
          title: "Analyze First",
          description: "Analyze your image before generating.",
          variant: "destructive",
        });
        return;
      }
      const a = B.video_config || {};
      await je({
        topic: a.topic || B.seed?.topic || "music aesthetic",
        tone: a.tone || t,
        bg_color: a.bg,
        accent_color: a.ac,
        voiceover: he,
      });
    },
    Fn = () => {
      (Me(null), _e(null));
    },
    Un = [
      {
        id: "text",
        label: "Text",
        icon: e.jsxDEV(
          Pe,
          { className: "h-3.5 w-3.5" },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
            lineNumber: 691,
            columnNumber: 40,
          },
          this,
        ),
      },
      {
        id: "audio",
        label: "Audio",
        icon: e.jsxDEV(
          wn,
          { className: "h-3.5 w-3.5" },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
            lineNumber: 692,
            columnNumber: 42,
          },
          this,
        ),
      },
      {
        id: "image",
        label: "Image",
        icon: e.jsxDEV(
          We,
          { className: "h-3.5 w-3.5" },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
            lineNumber: 693,
            columnNumber: 42,
          },
          this,
        ),
      },
    ],
    Ne = u && !!(r?.trim() || h?.trim());
  return e.jsxDEV(
    qe,
    {
      className: f,
      children: [
        e.jsxDEV(
          Je,
          {
            className: "pb-3",
            children: [
              e.jsxDEV(
                Qe,
                {
                  className: "text-lg flex items-center gap-2",
                  children: [
                    e.jsxDEV(
                      ie,
                      { className: "h-5 w-5" },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                        lineNumber: 703,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    Ne ? "Creating Your Video" : "AI Video Studio",
                  ],
                },
                void 0,
                !0,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                  lineNumber: 702,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                Ke,
                {
                  children: Ne
                    ? J
                      ? "Your video is ready — watch and download below."
                      : ne || g
                        ? "Your video is rendering. This usually takes 1–3 minutes."
                        : "Something went wrong. Adjust settings below and try again."
                    : "Generate cinematic videos from text, audio, or artwork",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                  lineNumber: 706,
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
              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
            lineNumber: 701,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          Ze,
          {
            className: "space-y-4",
            children: [
              Ne &&
                (ne || J || g) &&
                e.jsxDEV(
                  "div",
                  {
                    className: "space-y-4",
                    children: [
                      (ne || g) &&
                        (() => {
                          const a = te.startsWith("Compositing"),
                            z = g
                              ? 0
                              : a
                                ? an
                                : Math.min(
                                    95,
                                    Math.round(
                                      100 * (1 - Math.exp(-q / 25)) * 1.05,
                                    ),
                                  ),
                            M = g
                              ? "Starting up…"
                              : te && te !== "Starting…"
                                ? te
                                : q < 3
                                  ? "Queuing job…"
                                  : q < 10
                                    ? "Generating AI script…"
                                    : q < 18
                                      ? "Rendering scenes…"
                                      : "Adding music & compositing…";
                          return e.jsxDEV(
                            "div",
                            {
                              className:
                                "flex flex-col items-center gap-5 py-8",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "relative",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 748,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        ie,
                                        {
                                          className:
                                            "absolute inset-0 m-auto h-6 w-6 text-primary",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 749,
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
                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                    lineNumber: 747,
                                    columnNumber: 19,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "w-full max-w-xs space-y-2",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-center justify-between text-xs text-muted-foreground",
                                          children: [
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "font-medium text-foreground",
                                                children: M,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 754,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className: "tabular-nums",
                                                children: [z, "%"],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 755,
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
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 753,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "h-2 w-full rounded-full bg-muted overflow-hidden",
                                          children: e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "h-full rounded-full bg-primary transition-all duration-1000 ease-out",
                                              style: { width: `${z}%` },
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                              lineNumber: 758,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 757,
                                          columnNumber: 21,
                                        },
                                        this,
                                      ),
                                      ne &&
                                        q > 0 &&
                                        e.jsxDEV(
                                          "p",
                                          {
                                            className:
                                              "text-right text-xs text-muted-foreground tabular-nums",
                                            children: [q, "s elapsed"],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 764,
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
                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                    lineNumber: 752,
                                    columnNumber: 19,
                                  },
                                  this,
                                ),
                                r &&
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className:
                                        "max-w-xs text-center rounded-lg bg-muted/50 px-3 py-2",
                                      children: e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "text-xs text-muted-foreground truncate",
                                          children: ['"', r, '"'],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 772,
                                          columnNumber: 23,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                      lineNumber: 771,
                                      columnNumber: 21,
                                    },
                                    this,
                                  ),
                                ne &&
                                  e.jsxDEV(
                                    "button",
                                    {
                                      onClick: () => {
                                        ((xe.current = !0),
                                          Re.current?.abort());
                                      },
                                      className:
                                        "text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors",
                                      children: "Cancel",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
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
                                "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                              lineNumber: 746,
                              columnNumber: 17,
                            },
                            this,
                          );
                        })(),
                      J &&
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-3",
                            children: [
                              e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "rounded-lg overflow-hidden border bg-black",
                                  children: e.jsxDEV(
                                    "video",
                                    {
                                      src: J,
                                      className: "w-full",
                                      style: { maxHeight: 420 },
                                      controls: !0,
                                      autoPlay: !0,
                                      muted: !0,
                                      playsInline: !0,
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                      lineNumber: 793,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                  lineNumber: 792,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              T &&
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "bg-muted/50 rounded-lg p-3 space-y-2",
                                    children: e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "flex items-center gap-2 flex-wrap",
                                        children: [
                                          e.jsxDEV(
                                            D,
                                            {
                                              variant: "secondary",
                                              className: "text-[10px]",
                                              children: [
                                                T.width,
                                                "×",
                                                T.height,
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                              lineNumber: 806,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          T.scenesRendered > 1 &&
                                            e.jsxDEV(
                                              D,
                                              {
                                                variant: "outline",
                                                className: "text-[10px]",
                                                children: [
                                                  e.jsxDEV(
                                                    $e,
                                                    {
                                                      className:
                                                        "h-2.5 w-2.5 mr-1",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                      lineNumber: 811,
                                                      columnNumber: 27,
                                                    },
                                                    this,
                                                  ),
                                                  T.scenesRendered,
                                                  " Scenes",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 810,
                                                columnNumber: 25,
                                              },
                                              this,
                                            ),
                                          e.jsxDEV(
                                            D,
                                            {
                                              variant: "outline",
                                              className: "text-[10px]",
                                              children: [
                                                (
                                                  T.processingTime / 1e3
                                                ).toFixed(1),
                                                "s render",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                              lineNumber: 815,
                                              columnNumber: 23,
                                            },
                                            this,
                                          ),
                                          (T.source === "ai_model" ||
                                            T.source === "MaxCoreAI") &&
                                            e.jsxDEV(
                                              D,
                                              {
                                                variant: "default",
                                                className: "text-[10px]",
                                                children: [
                                                  e.jsxDEV(
                                                    Z,
                                                    {
                                                      className:
                                                        "h-2.5 w-2.5 mr-1",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                      lineNumber: 820,
                                                      columnNumber: 27,
                                                    },
                                                    this,
                                                  ),
                                                  "AI Generated",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 819,
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
                                          "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                        lineNumber: 805,
                                        columnNumber: 21,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                    lineNumber: 804,
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
                                      "a",
                                      {
                                        href: J,
                                        download: `maxbooster-video-${n}.mp4`,
                                        className:
                                          "inline-flex items-center justify-center flex-1 rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground",
                                        children: [
                                          e.jsxDEV(
                                            Fe,
                                            { className: "h-4 w-4 mr-2" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                              lineNumber: 833,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          "Download MP4",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                        lineNumber: 828,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    m &&
                                      e.jsxDEV(
                                        "button",
                                        {
                                          onClick: () => m(J),
                                          className:
                                            "inline-flex items-center justify-center flex-1 rounded-md text-sm font-medium h-9 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors",
                                          children: [
                                            e.jsxDEV(
                                              ie,
                                              { className: "h-4 w-4 mr-2" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 841,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                            "Import to Studio",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 837,
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
                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                  lineNumber: 827,
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
                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                            lineNumber: 791,
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
                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                    lineNumber: 721,
                    columnNumber: 11,
                  },
                  this,
                ),
              !(Ne && (ne || J)) &&
                !g &&
                !(Ne && x.current) &&
                e.jsxDEV(
                  e.Fragment,
                  {
                    children: [
                      e.jsxDEV(
                        "div",
                        {
                          className: "flex rounded-lg border overflow-hidden",
                          children: Un.map((a) =>
                            e.jsxDEV(
                              "button",
                              {
                                onClick: () => {
                                  (b(a.id), Fn());
                                },
                                className: `flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${N === a.id ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`,
                                children: [a.icon, a.label],
                              },
                              a.id,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                lineNumber: 858,
                                columnNumber: 13,
                              },
                              this,
                            ),
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                          lineNumber: 856,
                          columnNumber: 9,
                        },
                        this,
                      ),
                      N === "text" &&
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
                                      L,
                                      {
                                        className:
                                          "text-xs font-medium text-muted-foreground mb-1.5 block",
                                        children: "Topic / Description",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                        lineNumber: 877,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      ot,
                                      {
                                        value: j,
                                        onChange: (a) => o(a.target.value),
                                        placeholder:
                                          r ||
                                          "e.g., New single dropping Friday, behind the scenes studio session…",
                                        rows: 3,
                                        className: "resize-none",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                        lineNumber: 880,
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
                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                  lineNumber: 876,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "button",
                                {
                                  onClick: () => oe(!H),
                                  className:
                                    "flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors",
                                  children: [
                                    H
                                      ? e.jsxDEV(
                                          Jn,
                                          { className: "h-3.5 w-3.5" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 893,
                                            columnNumber: 31,
                                          },
                                          this,
                                        )
                                      : e.jsxDEV(
                                          Qn,
                                          { className: "h-3.5 w-3.5" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 893,
                                            columnNumber: 71,
                                          },
                                          this,
                                        ),
                                    H ? "Hide" : "Add",
                                    " hook / body / CTA (optional)",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                  lineNumber: 889,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              H &&
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "space-y-2 pl-2 border-l-2 border-muted",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          children: [
                                            e.jsxDEV(
                                              L,
                                              {
                                                className:
                                                  "text-xs text-muted-foreground mb-1 block",
                                                children: "Hook (opening line)",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 900,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              ce,
                                              {
                                                value: p,
                                                onChange: (a) =>
                                                  A(a.target.value),
                                                placeholder:
                                                  "Attention-grabbing first line…",
                                                className: "h-8 text-sm",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 901,
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
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 899,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          children: [
                                            e.jsxDEV(
                                              L,
                                              {
                                                className:
                                                  "text-xs text-muted-foreground mb-1 block",
                                                children: "Body (main message)",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 909,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              ce,
                                              {
                                                value: F,
                                                onChange: (a) =>
                                                  de(a.target.value),
                                                placeholder: "Core message…",
                                                className: "h-8 text-sm",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 910,
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
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 908,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          children: [
                                            e.jsxDEV(
                                              L,
                                              {
                                                className:
                                                  "text-xs text-muted-foreground mb-1 block",
                                                children:
                                                  "CTA (call to action)",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 918,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              ce,
                                              {
                                                value: re,
                                                onChange: (a) =>
                                                  R(a.target.value),
                                                placeholder:
                                                  "Stream now, follow for more…",
                                                className: "h-8 text-sm",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 919,
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
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 917,
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
                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                    lineNumber: 898,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "flex items-center gap-2",
                                  children: e.jsxDEV(
                                    "button",
                                    {
                                      onClick: () => Ce(!se),
                                      className: `flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${se ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`,
                                      children: [
                                        e.jsxDEV(
                                          Xe,
                                          { className: "h-3 w-3" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 938,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        se
                                          ? "Visual Style: ON"
                                          : "Visual Style (optional)",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                      lineNumber: 930,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                  lineNumber: 929,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              se &&
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "grid grid-cols-3 gap-1.5 max-h-[200px] overflow-y-auto pr-1",
                                    children: yt.map((a) => {
                                      const S = a.icon;
                                      return e.jsxDEV(
                                        "button",
                                        {
                                          onClick: () => Se(a.id),
                                          className: `p-2 rounded-lg border text-left transition-all ${fe === a.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50"}`,
                                          children: [
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex items-center gap-1.5 mb-1",
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "w-3.5 h-3.5 rounded-full flex-shrink-0",
                                                      style: {
                                                        backgroundColor:
                                                          a.color,
                                                      },
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                      lineNumber: 958,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    S,
                                                    {
                                                      className:
                                                        "h-3 w-3 text-muted-foreground flex-shrink-0",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                      lineNumber: 959,
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
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 957,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "text-[11px] font-medium block leading-tight",
                                                children: a.name,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 961,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        a.id,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 948,
                                          columnNumber: 21,
                                        },
                                        this,
                                      );
                                    }),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                    lineNumber: 944,
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
                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                            lineNumber: 875,
                            columnNumber: 11,
                          },
                          this,
                        ),
                      N === "audio" &&
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-3",
                            children: [
                              e.jsxDEV(
                                "input",
                                {
                                  ref: un,
                                  type: "file",
                                  accept: "audio/*",
                                  className: "hidden",
                                  onChange: Mn,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                  lineNumber: 973,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "button",
                                {
                                  onClick: () => un.current?.click(),
                                  className: `w-full rounded-lg border-2 border-dashed p-6 flex flex-col items-center gap-2 transition-colors ${le ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`,
                                  children: le
                                    ? e.jsxDEV(
                                        e.Fragment,
                                        {
                                          children: [
                                            e.jsxDEV(
                                              X,
                                              {
                                                className:
                                                  "h-8 w-8 text-primary",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 988,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "text-sm font-medium",
                                                children: le.name,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 989,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "text-xs text-muted-foreground",
                                                children: [
                                                  (
                                                    le.size /
                                                    1024 /
                                                    1024
                                                  ).toFixed(2),
                                                  " MB — click to change",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 990,
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
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 987,
                                          columnNumber: 17,
                                        },
                                        this,
                                      )
                                    : e.jsxDEV(
                                        e.Fragment,
                                        {
                                          children: [
                                            e.jsxDEV(
                                              gn,
                                              {
                                                className:
                                                  "h-8 w-8 text-muted-foreground",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 994,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "text-sm font-medium",
                                                children:
                                                  "Upload an audio file",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 995,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "text-xs text-muted-foreground",
                                                children:
                                                  "MP3, WAV, AAC, FLAC, OGG",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 996,
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
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 993,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                  lineNumber: 980,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              le &&
                                !U &&
                                e.jsxDEV(
                                  Y,
                                  {
                                    onClick: _n,
                                    disabled: nn,
                                    variant: "outline",
                                    className: "w-full",
                                    children: nn
                                      ? e.jsxDEV(
                                          e.Fragment,
                                          {
                                            children: [
                                              e.jsxDEV(
                                                K,
                                                {
                                                  className:
                                                    "h-4 w-4 mr-2 animate-spin",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1009,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              "Analyzing audio…",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1009,
                                            columnNumber: 19,
                                          },
                                          this,
                                        )
                                      : e.jsxDEV(
                                          e.Fragment,
                                          {
                                            children: [
                                              e.jsxDEV(
                                                Z,
                                                { className: "h-4 w-4 mr-2" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1011,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              "Analyze Audio",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1011,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                    lineNumber: 1002,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              U &&
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "bg-muted/40 rounded-lg p-3 space-y-1.5 text-xs",
                                    children: [
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "font-medium text-sm",
                                          children: "Audio Analyzed",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 1018,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      U.analysis?.genre &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "flex gap-2",
                                            children: [
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className:
                                                    "text-muted-foreground",
                                                  children: "Genre:",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1021,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                D,
                                                {
                                                  variant: "secondary",
                                                  className: "text-[10px] h-4",
                                                  children: U.analysis.genre,
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1022,
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
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1020,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      U.analysis?.tempo &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "flex gap-2",
                                            children: [
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className:
                                                    "text-muted-foreground",
                                                  children: "Tempo:",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1027,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  children: [
                                                    Math.round(
                                                      U.analysis.tempo,
                                                    ),
                                                    " BPM",
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1028,
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
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1026,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      U.analysis?.key &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "flex gap-2",
                                            children: [
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className:
                                                    "text-muted-foreground",
                                                  children: "Key:",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1033,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "span",
                                                { children: U.analysis.key },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1034,
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
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1032,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      U.seed?.topic &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "flex gap-2",
                                            children: [
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className:
                                                    "text-muted-foreground",
                                                  children: "Topic:",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1039,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className: "text-foreground",
                                                  children: U.seed.topic,
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1040,
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
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1038,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      e.jsxDEV(
                                        "button",
                                        {
                                          onClick: () => {
                                            (Ge(null), en(null));
                                          },
                                          className:
                                            "text-[10px] text-muted-foreground underline pt-1",
                                          children: "Clear and re-upload",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 1043,
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
                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                    lineNumber: 1017,
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
                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                            lineNumber: 972,
                            columnNumber: 11,
                          },
                          this,
                        ),
                      N === "image" &&
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-3",
                            children: [
                              e.jsxDEV(
                                "input",
                                {
                                  ref: dn,
                                  type: "file",
                                  accept: "image/*",
                                  className: "hidden",
                                  onChange: Ln,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                  lineNumber: 1057,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "button",
                                {
                                  onClick: () => dn.current?.click(),
                                  className: `w-full rounded-lg border-2 border-dashed transition-colors overflow-hidden ${ye ? "border-primary" : "border-border hover:border-primary/50"}`,
                                  children: ee
                                    ? e.jsxDEV(
                                        "div",
                                        {
                                          className: "relative",
                                          children: [
                                            e.jsxDEV(
                                              "img",
                                              {
                                                src: ee,
                                                alt: "Artwork preview",
                                                className:
                                                  "w-full max-h-48 object-cover",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 1072,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity",
                                                children: e.jsxDEV(
                                                  "span",
                                                  {
                                                    className:
                                                      "text-white text-sm font-medium",
                                                    children: "Click to change",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                    lineNumber: 1078,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 1077,
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
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 1071,
                                          columnNumber: 17,
                                        },
                                        this,
                                      )
                                    : e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "p-6 flex flex-col items-center gap-2",
                                          children: [
                                            e.jsxDEV(
                                              gn,
                                              {
                                                className:
                                                  "h-8 w-8 text-muted-foreground",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 1083,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "text-sm font-medium",
                                                children:
                                                  "Upload artwork or image",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 1084,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "text-xs text-muted-foreground",
                                                children:
                                                  "JPG, PNG, WEBP — colors & mood are extracted",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 1085,
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
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 1082,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                  lineNumber: 1064,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              ye &&
                                !B &&
                                e.jsxDEV(
                                  Y,
                                  {
                                    onClick: Pn,
                                    disabled: sn,
                                    variant: "outline",
                                    className: "w-full",
                                    children: sn
                                      ? e.jsxDEV(
                                          e.Fragment,
                                          {
                                            children: [
                                              e.jsxDEV(
                                                K,
                                                {
                                                  className:
                                                    "h-4 w-4 mr-2 animate-spin",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1098,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              "Analyzing image…",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1098,
                                            columnNumber: 19,
                                          },
                                          this,
                                        )
                                      : e.jsxDEV(
                                          e.Fragment,
                                          {
                                            children: [
                                              e.jsxDEV(
                                                Z,
                                                { className: "h-4 w-4 mr-2" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1100,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              "Analyze Image",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1100,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                    lineNumber: 1091,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              B &&
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "bg-muted/40 rounded-lg p-3 space-y-2 text-xs",
                                    children: [
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className: "font-medium text-sm",
                                          children: "Image Analyzed",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 1107,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      B.analysis?.mood &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "flex gap-2",
                                            children: [
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className:
                                                    "text-muted-foreground",
                                                  children: "Mood:",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1110,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "span",
                                                { children: B.analysis.mood },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1111,
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
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1109,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      B.analysis?.genre_hint &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "flex gap-2",
                                            children: [
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className:
                                                    "text-muted-foreground",
                                                  children: "Genre hint:",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1116,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                D,
                                                {
                                                  variant: "secondary",
                                                  className: "text-[10px] h-4",
                                                  children:
                                                    B.analysis.genre_hint,
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1117,
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
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1115,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      B.palette &&
                                        B.palette.length > 0 &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            children: [
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className:
                                                    "text-muted-foreground block mb-1",
                                                  children:
                                                    "Extracted palette:",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1122,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className: "flex gap-1.5",
                                                  children: B.palette
                                                    .slice(0, 5)
                                                    .map((a, S) =>
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "w-7 h-7 rounded-full border border-white/20 shadow-sm",
                                                          style: {
                                                            backgroundColor: a,
                                                          },
                                                          title: a,
                                                        },
                                                        S,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                          lineNumber: 1125,
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
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1123,
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
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1121,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      e.jsxDEV(
                                        "button",
                                        {
                                          onClick: () => {
                                            (ze(null),
                                              rn(null),
                                              ee && URL.revokeObjectURL(ee),
                                              on(null));
                                          },
                                          className:
                                            "text-[10px] text-muted-foreground underline pt-1",
                                          children: "Clear and re-upload",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 1135,
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
                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                    lineNumber: 1106,
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
                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                            lineNumber: 1056,
                            columnNumber: 11,
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
                                    L,
                                    {
                                      className:
                                        "text-xs font-medium text-muted-foreground mb-1.5 block",
                                      children: "Aspect Ratio",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                      lineNumber: 1149,
                                      columnNumber: 13,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    Ue,
                                    {
                                      value: Ie,
                                      onValueChange: ln,
                                      children: [
                                        e.jsxDEV(
                                          Oe,
                                          {
                                            className: "h-9",
                                            children: e.jsxDEV(
                                              Ye,
                                              {},
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 1154,
                                                columnNumber: 17,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1153,
                                            columnNumber: 15,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          Be,
                                          {
                                            children: kt.map((a) =>
                                              e.jsxDEV(
                                                Q,
                                                {
                                                  value: a.id,
                                                  children: a.name,
                                                },
                                                a.id,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1158,
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
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1156,
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
                                        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                      lineNumber: 1152,
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
                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                lineNumber: 1148,
                                columnNumber: 11,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                children: [
                                  e.jsxDEV(
                                    L,
                                    {
                                      className:
                                        "text-xs font-medium text-muted-foreground mb-1.5 block",
                                      children: [
                                        e.jsxDEV(
                                          Kn,
                                          {
                                            className:
                                              "h-3.5 w-3.5 inline mr-1",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1168,
                                            columnNumber: 15,
                                          },
                                          this,
                                        ),
                                        "Duration",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                      lineNumber: 1167,
                                      columnNumber: 13,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    Ue,
                                    {
                                      value: String(ke),
                                      onValueChange: (a) => Gn(Number(a)),
                                      children: [
                                        e.jsxDEV(
                                          Oe,
                                          {
                                            className: "h-9",
                                            children: e.jsxDEV(
                                              Ye,
                                              {},
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 1173,
                                                columnNumber: 17,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1172,
                                            columnNumber: 15,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          Be,
                                          {
                                            children: [
                                              e.jsxDEV(
                                                Q,
                                                {
                                                  value: "8",
                                                  children: "8 seconds",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1176,
                                                  columnNumber: 17,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                Q,
                                                {
                                                  value: "10",
                                                  children: "10 seconds",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1177,
                                                  columnNumber: 17,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                Q,
                                                {
                                                  value: "15",
                                                  children: "15 seconds",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1178,
                                                  columnNumber: 17,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                Q,
                                                {
                                                  value: "20",
                                                  children: "20 seconds",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1179,
                                                  columnNumber: 17,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                Q,
                                                {
                                                  value: "30",
                                                  children: "30 seconds",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1180,
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
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1175,
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
                                        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                      lineNumber: 1171,
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
                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                lineNumber: 1166,
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
                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                          lineNumber: 1147,
                          columnNumber: 9,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "div",
                        {
                          children: [
                            e.jsxDEV(
                              L,
                              {
                                className:
                                  "text-xs font-medium text-muted-foreground mb-1.5 block",
                                children: "Artist Name (optional)",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                lineNumber: 1187,
                                columnNumber: 11,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              ce,
                              {
                                value: be,
                                onChange: (a) => zn(a.target.value),
                                placeholder: "Your artist or brand name",
                                className: "h-9",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                lineNumber: 1190,
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
                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                          lineNumber: 1186,
                          columnNumber: 9,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "button",
                        {
                          onClick: () => Sn(!he),
                          className: `flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${he ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`,
                          children: [
                            e.jsxDEV(
                              wn,
                              { className: "h-3 w-3" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                lineNumber: 1207,
                                columnNumber: 11,
                              },
                              this,
                            ),
                            he
                              ? "Voiceover: ON"
                              : "Add voiceover (AI reads your text)",
                          ],
                        },
                        void 0,
                        !0,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                          lineNumber: 1199,
                          columnNumber: 9,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        Y,
                        {
                          onClick: N === "text" ? Tn : N === "audio" ? Rn : $n,
                          disabled:
                            ne ||
                            (N === "text" &&
                              !j.trim() &&
                              !r.trim() &&
                              !p.trim()) ||
                            (N === "audio" && !U) ||
                            (N === "image" && !B),
                          className: "w-full",
                          size: "lg",
                          children: ne
                            ? e.jsxDEV(
                                e.Fragment,
                                {
                                  children: [
                                    e.jsxDEV(
                                      K,
                                      {
                                        className: "h-4 w-4 mr-2 animate-spin",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                        lineNumber: 1229,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    te || "Generating Video…",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                  lineNumber: 1228,
                                  columnNumber: 13,
                                },
                                this,
                              )
                            : e.jsxDEV(
                                e.Fragment,
                                {
                                  children: [
                                    e.jsxDEV(
                                      ie,
                                      { className: "h-4 w-4 mr-2" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                        lineNumber: 1234,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    N === "text"
                                      ? "Generate Video from Text"
                                      : N === "audio"
                                        ? "Generate Video from Audio"
                                        : "Generate Video from Image",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                  lineNumber: 1233,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                          lineNumber: 1212,
                          columnNumber: 9,
                        },
                        this,
                      ),
                      ne &&
                        !Ne &&
                        (() => {
                          const z = te.startsWith("Compositing")
                              ? an
                              : Math.min(
                                  95,
                                  Math.round(
                                    100 * (1 - Math.exp(-q / 25)) * 1.05,
                                  ),
                                ),
                            M =
                              te && te !== "Starting…"
                                ? te
                                : q < 3
                                  ? "Queuing job…"
                                  : q < 10
                                    ? "Generating AI script…"
                                    : q < 18
                                      ? "Rendering scenes…"
                                      : "Adding music & compositing…";
                          return e.jsxDEV(
                            "div",
                            {
                              className: "space-y-1.5 pt-1",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "flex items-center justify-between text-xs text-muted-foreground",
                                    children: [
                                      e.jsxDEV(
                                        "span",
                                        { children: M },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 1261,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "span",
                                        {
                                          className: "tabular-nums",
                                          children: [
                                            z,
                                            "%",
                                            q > 0 ? ` · ${q}s` : "",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 1262,
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
                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                    lineNumber: 1260,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "h-1.5 w-full rounded-full bg-muted overflow-hidden",
                                    children: e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "h-full rounded-full bg-primary transition-all duration-1000 ease-out",
                                        style: { width: `${z}%` },
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                        lineNumber: 1265,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                    lineNumber: 1264,
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
                                "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                              lineNumber: 1259,
                              columnNumber: 13,
                            },
                            this,
                          );
                        })(),
                      J &&
                        e.jsxDEV(
                          "div",
                          {
                            className: "space-y-3",
                            children: [
                              e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "rounded-lg overflow-hidden border bg-black",
                                  children: e.jsxDEV(
                                    "video",
                                    {
                                      src: J,
                                      className: "w-full",
                                      style: { maxHeight: 420 },
                                      controls: !0,
                                      autoPlay: !0,
                                      muted: !0,
                                      playsInline: !0,
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                      lineNumber: 1278,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                  lineNumber: 1277,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              T &&
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "bg-muted/50 rounded-lg p-3 space-y-2",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-center gap-2 flex-wrap",
                                          children: [
                                            e.jsxDEV(
                                              D,
                                              {
                                                variant: "secondary",
                                                className: "text-[10px]",
                                                children: [
                                                  T.width,
                                                  "×",
                                                  T.height,
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 1292,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            T.scenesRendered > 1 &&
                                              e.jsxDEV(
                                                D,
                                                {
                                                  variant: "outline",
                                                  className: "text-[10px]",
                                                  children: [
                                                    e.jsxDEV(
                                                      $e,
                                                      {
                                                        className:
                                                          "h-2.5 w-2.5 mr-1",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                        lineNumber: 1297,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    T.scenesRendered,
                                                    " Scenes",
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1296,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                            e.jsxDEV(
                                              D,
                                              {
                                                variant: "outline",
                                                className: "text-[10px]",
                                                children: [
                                                  (
                                                    T.processingTime / 1e3
                                                  ).toFixed(1),
                                                  "s render",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 1301,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            T.source === "ai_model" &&
                                              e.jsxDEV(
                                                D,
                                                {
                                                  variant: "default",
                                                  className: "text-[10px]",
                                                  children: [
                                                    e.jsxDEV(
                                                      Z,
                                                      {
                                                        className:
                                                          "h-2.5 w-2.5 mr-1",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                        lineNumber: 1306,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    "AI Generated",
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1305,
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
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 1291,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      T.hook &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "text-xs",
                                            children: [
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className: "font-medium",
                                                  children: "Hook:",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1313,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              " ",
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className:
                                                    "text-muted-foreground",
                                                  children: T.hook.substring(
                                                    0,
                                                    120,
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1314,
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
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1312,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      T.hashtags?.length > 0 &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "text-xs",
                                            children: [
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className: "font-medium",
                                                  children: "Hashtags:",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1319,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              " ",
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className:
                                                    "text-blue-500 dark:text-blue-400",
                                                  children: T.hashtags
                                                    .slice(0, 5)
                                                    .join(" "),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1320,
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
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1318,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                      T.sentimentLabel &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "text-xs flex items-center gap-1.5",
                                            children: [
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className: "font-medium",
                                                  children: "Sentiment:",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1327,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className:
                                                    T.sentimentLabel ===
                                                    "positive"
                                                      ? "text-green-500 dark:text-green-400"
                                                      : T.sentimentLabel ===
                                                          "negative"
                                                        ? "text-red-500 dark:text-red-400"
                                                        : "text-muted-foreground",
                                                  children: [
                                                    T.sentimentLabel,
                                                    T.sentimentScore != null &&
                                                      ` (${Math.round(T.sentimentScore * 100)}%)`,
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                  lineNumber: 1328,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              T.contentConfidence != null &&
                                                e.jsxDEV(
                                                  "span",
                                                  {
                                                    className:
                                                      "text-muted-foreground",
                                                    children: [
                                                      "· Confidence ",
                                                      Math.round(
                                                        T.contentConfidence *
                                                          100,
                                                      ),
                                                      "%",
                                                    ],
                                                  },
                                                  void 0,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                    lineNumber: 1340,
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
                                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                            lineNumber: 1326,
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
                                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                    lineNumber: 1290,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "flex gap-2",
                                  children: [
                                    e.jsxDEV(
                                      "a",
                                      {
                                        href: J,
                                        download: `maxbooster-video-${n}.mp4`,
                                        className:
                                          "inline-flex items-center justify-center flex-1 rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground",
                                        children: [
                                          e.jsxDEV(
                                            Fe,
                                            { className: "h-4 w-4 mr-2" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                              lineNumber: 1355,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          "Download MP4",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                        lineNumber: 1350,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    m &&
                                      e.jsxDEV(
                                        "button",
                                        {
                                          onClick: () => m(J),
                                          className:
                                            "inline-flex items-center justify-center flex-1 rounded-md text-sm font-medium h-9 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors",
                                          children: [
                                            e.jsxDEV(
                                              ie,
                                              { className: "h-4 w-4 mr-2" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                                lineNumber: 1363,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            "Import to Studio",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                          lineNumber: 1359,
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
                                    "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                                  lineNumber: 1349,
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
                              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                            lineNumber: 1276,
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
                      "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
                    lineNumber: 854,
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
              "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
            lineNumber: 717,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    !0,
    {
      fileName:
        "/home/runner/workspace/client/src/components/content/ServerVideoGenerator.tsx",
      lineNumber: 700,
      columnNumber: 5,
    },
    this,
  );
}
const jt = [
    {
      id: "modern",
      name: "Modern",
      description: "Clean contemporary",
      color: "#6366f1",
    },
    {
      id: "cinematic",
      name: "Cinematic",
      description: "Film-quality dramatic",
      color: "#e94560",
    },
    {
      id: "minimal",
      name: "Minimal",
      description: "Clean & focused",
      color: "#6b7280",
    },
    {
      id: "bold",
      name: "Bold",
      description: "High contrast impact",
      color: "#f59e0b",
    },
    {
      id: "vintage",
      name: "Vintage",
      description: "Retro aesthetic",
      color: "#92400e",
    },
    {
      id: "neon",
      name: "Neon",
      description: "Vibrant electric",
      color: "#ff6ec7",
    },
    {
      id: "luxury",
      name: "Luxury",
      description: "Premium gold/black",
      color: "#d4af37",
    },
  ],
  Dt = {
    instagram: "Instagram Feed (1:1)",
    instagram_reels: "Instagram Reels (9:16)",
    tiktok: "TikTok (9:16)",
    youtube: "YouTube Thumbnail (16:9)",
    facebook: "Facebook (16:9)",
    twitter: "Twitter/X (16:9)",
    linkedin: "LinkedIn (1.91:1)",
    threads: "Threads (1:1)",
  };
function zt({
  platform: n,
  topic: r,
  tone: t = "energetic",
  goal: l = "growth",
  artistName: s = "",
  endpoint: c,
  onImageGenerated: m,
  className: f = "",
}) {
  const { toast: h } = He(),
    [d, v] = V.useState("modern"),
    [k, y] = V.useState(t),
    [C, u] = V.useState(!1),
    [i, w] = V.useState(null),
    [N, b] = V.useState(!1),
    x = c || "/api/social/generate-image",
    g = x.includes("/multimodal/generate"),
    E = async () => {
      if (!r.trim()) {
        h({
          title: "Topic Required",
          description: "Please enter a topic or description for the image.",
          variant: "destructive",
        });
        return;
      }
      (u(!0), w(null));
      try {
        let p;
        if (g) {
          const A = n === "instagram_reels" ? "instagram" : n,
            de = [
              "facebook",
              "instagram",
              "threads",
              "tiktok",
              "youtube",
              "google_business",
              "linkedin",
            ].includes(A)
              ? A
              : "instagram",
            H = (
              (
                await (
                  await De("POST", x, {
                    input: { modality: "text", payload: r },
                    platforms: [de],
                    intent: `${k} image creative for ${s || "artist"}`,
                    constraints: { styleTags: [d, k] },
                  })
                ).json()
              ).assets || []
            ).find((oe) => oe.modality === "image");
          if (!H) throw new Error("No image asset returned");
          p = {
            success: !0,
            url: H.payload || null,
            width: 1080,
            height: 1080,
            format: "png",
            platform: n,
            prompt_used: H.metadata?.prompt || r,
            color_scheme: {
              primary: "#000000",
              secondary: "#ffffff",
              accent: "#6366f1",
              background: "#000000",
            },
            processing_time_ms: 0,
          };
        } else if (
          ((p = await (
            await De("POST", x, {
              topic: r,
              platform: n,
              tone: k,
              goal: l,
              artist_name: s || void 0,
              style: d,
            })
          ).json()),
          !p.success)
        )
          throw new Error(p.message || "Image generation failed");
        (w(p),
          p.url && m && m(p.url),
          h({
            title: "Image Creative Ready",
            description: p.url
              ? "Your AI-generated image is ready."
              : "Visual spec generated — use the prompt with your image tool.",
          }));
      } catch (p) {
        const A = p instanceof Error ? p.message : "Image generation failed";
        h({
          title: "Generation Failed",
          description: A,
          variant: "destructive",
        });
      } finally {
        u(!1);
      }
    },
    j = async () => {
      const p = i?.prompt_used || i?.visual_spec?.thumbnail_prompt;
      p &&
        (await navigator.clipboard.writeText(p),
        b(!0),
        setTimeout(() => b(!1), 2e3));
    },
    o = () => {
      if (!i?.url) return;
      const p = document.createElement("a");
      ((p.href = i.url),
        (p.download = `ai-image-${n}-${Date.now()}.${i.format || "png"}`),
        p.click());
    };
  return e.jsxDEV(
    qe,
    {
      className: `border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/20 dark:to-violet-950/20 ${f}`,
      children: [
        e.jsxDEV(
          Je,
          {
            children: [
              e.jsxDEV(
                Qe,
                {
                  className: "flex items-center gap-2",
                  children: [
                    e.jsxDEV(
                      We,
                      { className: "w-5 h-5 text-indigo-500" },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                        lineNumber: 211,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    "AI Image Creative Generator",
                  ],
                },
                void 0,
                !0,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                  lineNumber: 210,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                Ke,
                {
                  children:
                    "Generate platform-optimized image creatives using the Max Booster AI model — cinematic, styled, and ready to post.",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                  lineNumber: 214,
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
              "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
            lineNumber: 209,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          Ze,
          {
            className: "space-y-5",
            children: [
              e.jsxDEV(
                "div",
                {
                  className: "flex flex-wrap gap-2",
                  children: [
                    e.jsxDEV(
                      D,
                      {
                        variant: "outline",
                        className: "text-indigo-600 border-indigo-300",
                        children: Dt[n] || n,
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                        lineNumber: 220,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      D,
                      {
                        variant: "outline",
                        className: "text-violet-600 border-violet-300",
                        children: [r.slice(0, 40), r.length > 40 ? "…" : ""],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                        lineNumber: 223,
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
                    "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                  lineNumber: 219,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                "div",
                {
                  className: "space-y-2",
                  children: [
                    e.jsxDEV(
                      L,
                      { children: "Visual Style" },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                        lineNumber: 229,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className:
                          "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2",
                        children: jt.map((p) =>
                          e.jsxDEV(
                            "button",
                            {
                              onClick: () => v(p.id),
                              className: `flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-xs transition-all cursor-pointer ${d === p.id ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 shadow-sm" : "border-border hover:border-indigo-300"}`,
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "w-5 h-5 rounded-full",
                                    style: { backgroundColor: p.color },
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                    lineNumber: 241,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "span",
                                  {
                                    className:
                                      "font-medium leading-tight text-center",
                                    children: p.name,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                    lineNumber: 242,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              ],
                            },
                            p.id,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                              lineNumber: 232,
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
                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                        lineNumber: 230,
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
                    "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                  lineNumber: 228,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                "div",
                {
                  className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className: "space-y-1",
                        children: [
                          e.jsxDEV(
                            L,
                            { children: "Tone" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                              lineNumber: 250,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            Ue,
                            {
                              value: k,
                              onValueChange: (p) => y(p),
                              children: [
                                e.jsxDEV(
                                  Oe,
                                  {
                                    children: e.jsxDEV(
                                      Ye,
                                      {},
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                        lineNumber: 253,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                    lineNumber: 252,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  Be,
                                  {
                                    children: [
                                      e.jsxDEV(
                                        Q,
                                        {
                                          value: "energetic",
                                          children: "Energetic",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                          lineNumber: 256,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        Q,
                                        { value: "calm", children: "Calm" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                          lineNumber: 257,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        Q,
                                        {
                                          value: "professional",
                                          children: "Professional",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                          lineNumber: 258,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        Q,
                                        {
                                          value: "playful",
                                          children: "Playful",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                          lineNumber: 259,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        Q,
                                        {
                                          value: "dramatic",
                                          children: "Dramatic",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                          lineNumber: 260,
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
                                      "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
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
                                "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                              lineNumber: 251,
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
                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                        lineNumber: 249,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className: "flex items-end",
                        children: e.jsxDEV(
                          Y,
                          {
                            onClick: E,
                            disabled: C || !r.trim(),
                            className:
                              "w-full bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700",
                            children: C
                              ? e.jsxDEV(
                                  e.Fragment,
                                  {
                                    children: [
                                      e.jsxDEV(
                                        K,
                                        {
                                          className:
                                            "w-4 h-4 mr-2 animate-spin",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                          lineNumber: 273,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      "Generating…",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                    lineNumber: 272,
                                    columnNumber: 17,
                                  },
                                  this,
                                )
                              : e.jsxDEV(
                                  e.Fragment,
                                  {
                                    children: [
                                      e.jsxDEV(
                                        Z,
                                        { className: "w-4 h-4 mr-2" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                          lineNumber: 278,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      "Generate Image",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                    lineNumber: 277,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                            lineNumber: 266,
                            columnNumber: 13,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                        lineNumber: 265,
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
                    "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                  lineNumber: 248,
                  columnNumber: 9,
                },
                this,
              ),
              i &&
                e.jsxDEV(
                  "div",
                  {
                    className: "space-y-4 pt-2 border-t",
                    children: i.url
                      ? e.jsxDEV(
                          "div",
                          {
                            className: "space-y-3",
                            children: [
                              e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "rounded-lg overflow-hidden border bg-black",
                                  children: e.jsxDEV(
                                    "img",
                                    {
                                      src: i.url,
                                      alt: "AI-generated creative",
                                      className:
                                        "w-full object-contain max-h-80",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                      lineNumber: 291,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                  lineNumber: 290,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "flex flex-wrap gap-2",
                                  children: [
                                    e.jsxDEV(
                                      D,
                                      {
                                        variant: "secondary",
                                        children: [i.width, "×", i.height],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                        lineNumber: 298,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      D,
                                      {
                                        variant: "secondary",
                                        children: i.format?.toUpperCase(),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                        lineNumber: 301,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      D,
                                      {
                                        variant: "secondary",
                                        children: [i.processing_time_ms, "ms"],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                        lineNumber: 302,
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
                                    "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                  lineNumber: 297,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "flex gap-2",
                                  children: [
                                    e.jsxDEV(
                                      Y,
                                      {
                                        size: "sm",
                                        onClick: o,
                                        variant: "outline",
                                        className: "flex-1",
                                        children: [
                                          e.jsxDEV(
                                            Fe,
                                            { className: "w-4 h-4 mr-2" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                              lineNumber: 306,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          "Download",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                        lineNumber: 305,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      Y,
                                      {
                                        size: "sm",
                                        onClick: E,
                                        variant: "outline",
                                        className: "flex-1",
                                        children: [
                                          e.jsxDEV(
                                            Vn,
                                            { className: "w-4 h-4 mr-2" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                              lineNumber: 310,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          "Regenerate",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                        lineNumber: 309,
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
                                    "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                  lineNumber: 304,
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
                              "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                            lineNumber: 289,
                            columnNumber: 15,
                          },
                          this,
                        )
                      : i.visual_spec
                        ? e.jsxDEV(
                            "div",
                            {
                              className: "space-y-3",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "p-4 rounded-lg bg-muted/50 border space-y-3",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: "flex items-center gap-2",
                                          children: [
                                            e.jsxDEV(
                                              Z,
                                              {
                                                className:
                                                  "w-4 h-4 text-indigo-500",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                lineNumber: 319,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "font-semibold text-sm",
                                                children:
                                                  "AI Visual Spec Generated",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                lineNumber: 320,
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
                                            "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                          lineNumber: 318,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: "space-y-1",
                                          children: [
                                            e.jsxDEV(
                                              L,
                                              {
                                                className:
                                                  "text-xs text-muted-foreground",
                                                children: "Generated Prompt",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                lineNumber: 324,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-sm leading-relaxed bg-background p-3 rounded border",
                                                children:
                                                  i.visual_spec
                                                    .thumbnail_prompt,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                lineNumber: 325,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              Y,
                                              {
                                                size: "sm",
                                                variant: "ghost",
                                                onClick: j,
                                                className: "h-7 text-xs",
                                                children: N
                                                  ? e.jsxDEV(
                                                      e.Fragment,
                                                      {
                                                        children: [
                                                          e.jsxDEV(
                                                            Zn,
                                                            {
                                                              className:
                                                                "w-3 h-3 mr-1",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                              lineNumber: 335,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          " Copied",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                        lineNumber: 335,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    )
                                                  : e.jsxDEV(
                                                      e.Fragment,
                                                      {
                                                        children: [
                                                          e.jsxDEV(
                                                            et,
                                                            {
                                                              className:
                                                                "w-3 h-3 mr-1",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                              lineNumber: 337,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          " Copy Prompt",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                        lineNumber: 337,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                lineNumber: 328,
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
                                            "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                          lineNumber: 323,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: "space-y-1",
                                          children: [
                                            e.jsxDEV(
                                              L,
                                              {
                                                className:
                                                  "text-xs text-muted-foreground flex items-center gap-1",
                                                children: [
                                                  e.jsxDEV(
                                                    nt,
                                                    { className: "w-3 h-3" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                      lineNumber: 344,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  " Color Scheme",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                lineNumber: 343,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex gap-2 flex-wrap",
                                                children: Object.entries(
                                                  i.visual_spec.color_scheme,
                                                ).map(([p, A]) =>
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex items-center gap-1",
                                                      children: [
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "w-5 h-5 rounded-full border shadow-sm",
                                                            style: {
                                                              backgroundColor:
                                                                A,
                                                            },
                                                            title: `${p}: ${A}`,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                            lineNumber: 349,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "text-xs text-muted-foreground",
                                                            children: p,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                            lineNumber: 354,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                      ],
                                                    },
                                                    p,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                      lineNumber: 348,
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
                                                  "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                lineNumber: 346,
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
                                            "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                          lineNumber: 342,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: "space-y-1",
                                          children: [
                                            e.jsxDEV(
                                              L,
                                              {
                                                className:
                                                  "text-xs text-muted-foreground flex items-center gap-1",
                                                children: [
                                                  e.jsxDEV(
                                                    Xe,
                                                    { className: "w-3 h-3" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                      lineNumber: 362,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  " Layout",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                lineNumber: 361,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className: "text-sm",
                                                children: i.visual_spec.layout,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                lineNumber: 364,
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
                                            "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                          lineNumber: 360,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: "flex gap-2 flex-wrap",
                                          children: [
                                            e.jsxDEV(
                                              D,
                                              {
                                                variant: "outline",
                                                children: [
                                                  i.visual_spec.dimensions
                                                    .width,
                                                  "×",
                                                  i.visual_spec.dimensions
                                                    .height,
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                lineNumber: 368,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              D,
                                              {
                                                variant: "outline",
                                                children:
                                                  i.visual_spec.format?.toUpperCase(),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                lineNumber: 371,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              D,
                                              {
                                                variant: "outline",
                                                children: [
                                                  i.visual_spec
                                                    .processing_time_ms,
                                                  "ms",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                                lineNumber: 372,
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
                                            "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                          lineNumber: 367,
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
                                      "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                    lineNumber: 317,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  Y,
                                  {
                                    size: "sm",
                                    onClick: E,
                                    variant: "outline",
                                    className: "w-full",
                                    children: [
                                      e.jsxDEV(
                                        Vn,
                                        { className: "w-4 h-4 mr-2" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                          lineNumber: 377,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      "Regenerate",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                                    lineNumber: 376,
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
                                "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                              lineNumber: 316,
                              columnNumber: 15,
                            },
                            this,
                          )
                        : null,
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
                    lineNumber: 287,
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
              "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
            lineNumber: 218,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    !0,
    {
      fileName:
        "/home/runner/workspace/client/src/components/content/AIImageGenerator.tsx",
      lineNumber: 208,
      columnNumber: 5,
    },
    this,
  );
}
export { zt as A, St as C, Gt as S };
