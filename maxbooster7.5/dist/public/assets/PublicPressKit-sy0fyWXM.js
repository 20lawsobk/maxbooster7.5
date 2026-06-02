import {
  dd as b,
  aH as h,
  f as e,
  ap as N,
  ao as d,
  d1 as p,
  eb as x,
  ec as f,
  ed as g,
  fT as P,
  aO as w,
  bg as v,
  cB as n,
  cY as k,
  dq as E,
} from "./vendor-react-31oK5L0i.js";
import { B as j, x as c } from "./studio-DOUfHW5v.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
function R() {
  const t = b().slug,
    {
      data: s,
      isLoading: m,
      isError: o,
    } = h({
      queryKey: ["/api/press-kit/public", t],
      queryFn: async () => {
        const i = await fetch(`/api/press-kit/public/${t}`);
        if (!i.ok) throw new Error("Not found");
        return i.json();
      },
      retry: !1,
    });
  if (m)
    return e.jsxDEV(
      "div",
      {
        className:
          "min-h-screen flex items-center justify-center bg-background",
        children: e.jsxDEV(
          "div",
          {
            className: "text-center space-y-3",
            children: [
              e.jsxDEV(
                N,
                { className: "h-8 w-8 animate-spin mx-auto text-primary" },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                  lineNumber: 40,
                  columnNumber: 11,
                },
                this,
              ),
              e.jsxDEV(
                "p",
                {
                  className: "text-muted-foreground text-sm",
                  children: "Loading press kit…",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                  lineNumber: 41,
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
              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
            lineNumber: 39,
            columnNumber: 9,
          },
          this,
        ),
      },
      void 0,
      !1,
      {
        fileName: "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
        lineNumber: 38,
        columnNumber: 7,
      },
      this,
    );
  if (o || !s)
    return e.jsxDEV(
      "div",
      {
        className:
          "min-h-screen flex items-center justify-center bg-background",
        children: e.jsxDEV(
          "div",
          {
            className: "text-center space-y-4 max-w-sm mx-auto px-6",
            children: [
              e.jsxDEV(
                d,
                { className: "h-12 w-12 text-muted-foreground mx-auto" },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                  lineNumber: 51,
                  columnNumber: 11,
                },
                this,
              ),
              e.jsxDEV(
                "h1",
                {
                  className: "text-2xl font-bold",
                  children: "Press Kit Not Found",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                  lineNumber: 52,
                  columnNumber: 11,
                },
                this,
              ),
              e.jsxDEV(
                "p",
                {
                  className: "text-muted-foreground",
                  children:
                    "This press kit is either private or doesn't exist. Please contact the artist directly for press materials.",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                  lineNumber: 53,
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
              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
            lineNumber: 50,
            columnNumber: 9,
          },
          this,
        ),
      },
      void 0,
      !1,
      {
        fileName: "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
        lineNumber: 49,
        columnNumber: 7,
      },
      this,
    );
  const r = s.socialLinks ?? {},
    l = s.photos ?? [],
    u = s.genres ?? [];
  return e.jsxDEV(
    "div",
    {
      className: "min-h-screen bg-background",
      children: [
        e.jsxDEV(
          "div",
          {
            className:
              "relative bg-gradient-to-b from-primary/10 to-background",
            children: e.jsxDEV(
              "div",
              {
                className: "container mx-auto max-w-5xl px-6 py-16",
                children: e.jsxDEV(
                  "div",
                  {
                    className: "flex flex-col md:flex-row gap-10 items-start",
                    children: [
                      e.jsxDEV(
                        "div",
                        {
                          className: "flex-shrink-0",
                          children: e.jsxDEV(
                            "div",
                            {
                              className:
                                "w-48 h-48 md:w-56 md:h-56 rounded-2xl overflow-hidden border-4 border-white/10 shadow-2xl bg-muted flex items-center justify-center",
                              children: l[0]?.url
                                ? e.jsxDEV(
                                    "img",
                                    {
                                      src: l[0].url,
                                      alt: s.artistName,
                                      className: "w-full h-full object-cover",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                      lineNumber: 75,
                                      columnNumber: 19,
                                    },
                                    this,
                                  )
                                : e.jsxDEV(
                                    p,
                                    {
                                      className:
                                        "h-20 w-20 text-muted-foreground",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                      lineNumber: 77,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                              lineNumber: 73,
                              columnNumber: 15,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                          lineNumber: 72,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "div",
                        {
                          className: "space-y-4 flex-1",
                          children: [
                            e.jsxDEV(
                              "div",
                              {
                                children: [
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className:
                                        "text-sm font-medium text-primary uppercase tracking-widest mb-1",
                                      children: "Electronic Press Kit",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                      lineNumber: 85,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "h1",
                                    {
                                      className:
                                        "text-4xl md:text-5xl font-black tracking-tight",
                                      children: s.artistName || "Artist",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                      lineNumber: 86,
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
                                  "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                lineNumber: 84,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "flex flex-wrap gap-2",
                                children: u.map((i) =>
                                  e.jsxDEV(
                                    j,
                                    {
                                      variant: "secondary",
                                      className: "text-sm px-3 py-1",
                                      children: i,
                                    },
                                    i,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                      lineNumber: 91,
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
                                  "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                lineNumber: 89,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            s.shortBio &&
                              e.jsxDEV(
                                "p",
                                {
                                  className:
                                    "text-lg text-muted-foreground leading-relaxed max-w-2xl",
                                  children: s.shortBio,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                  lineNumber: 96,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "flex items-center gap-4 pt-2",
                                children: [
                                  r.instagram &&
                                    e.jsxDEV(
                                      "a",
                                      {
                                        href: r.instagram,
                                        target: "_blank",
                                        rel: "noopener noreferrer",
                                        className:
                                          "p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors",
                                        children: e.jsxDEV(
                                          x,
                                          { className: "h-5 w-5" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                            lineNumber: 106,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                        lineNumber: 104,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  r.twitter &&
                                    e.jsxDEV(
                                      "a",
                                      {
                                        href: r.twitter,
                                        target: "_blank",
                                        rel: "noopener noreferrer",
                                        className:
                                          "p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors",
                                        children: e.jsxDEV(
                                          f,
                                          { className: "h-5 w-5" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                            lineNumber: 112,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                        lineNumber: 110,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  r.youtube &&
                                    e.jsxDEV(
                                      "a",
                                      {
                                        href: r.youtube,
                                        target: "_blank",
                                        rel: "noopener noreferrer",
                                        className:
                                          "p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors",
                                        children: e.jsxDEV(
                                          g,
                                          { className: "h-5 w-5" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                            lineNumber: 118,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                        lineNumber: 116,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  r.facebook &&
                                    e.jsxDEV(
                                      "a",
                                      {
                                        href: r.facebook,
                                        target: "_blank",
                                        rel: "noopener noreferrer",
                                        className:
                                          "p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors",
                                        children: e.jsxDEV(
                                          P,
                                          { className: "h-5 w-5" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                            lineNumber: 124,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                        lineNumber: 122,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  r.spotify &&
                                    e.jsxDEV(
                                      "a",
                                      {
                                        href: r.spotify,
                                        target: "_blank",
                                        rel: "noopener noreferrer",
                                        className:
                                          "p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors",
                                        children: e.jsxDEV(
                                          w,
                                          { className: "h-5 w-5" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                            lineNumber: 130,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                        lineNumber: 128,
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
                                  "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                lineNumber: 102,
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
                            "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                          lineNumber: 83,
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
                      "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                    lineNumber: 70,
                    columnNumber: 11,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                lineNumber: 69,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
            lineNumber: 68,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          c,
          {},
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
            lineNumber: 139,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          "div",
          {
            className: "container mx-auto max-w-5xl px-6 py-12",
            children: e.jsxDEV(
              "div",
              {
                className: "grid md:grid-cols-3 gap-12",
                children: [
                  e.jsxDEV(
                    "div",
                    {
                      className: "md:col-span-2 space-y-12",
                      children: [
                        s.bio &&
                          e.jsxDEV(
                            "section",
                            {
                              children: [
                                e.jsxDEV(
                                  "h2",
                                  {
                                    className: "text-2xl font-bold mb-4",
                                    children: "Biography",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                    lineNumber: 148,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "p",
                                  {
                                    className:
                                      "text-muted-foreground leading-relaxed whitespace-pre-wrap",
                                    children: s.bio,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                    lineNumber: 149,
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
                                "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                              lineNumber: 147,
                              columnNumber: 15,
                            },
                            this,
                          ),
                        l.length > 1 &&
                          e.jsxDEV(
                            "section",
                            {
                              children: [
                                e.jsxDEV(
                                  "h2",
                                  {
                                    className: "text-2xl font-bold mb-4",
                                    children: "Press Photos",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                    lineNumber: 157,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "grid grid-cols-2 gap-4",
                                    children: l.map((i, a) =>
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "group relative rounded-xl overflow-hidden aspect-video bg-muted border",
                                          children: [
                                            e.jsxDEV(
                                              "img",
                                              {
                                                src: i.url,
                                                alt:
                                                  i.caption ||
                                                  `Press photo ${a + 1}`,
                                                className:
                                                  "w-full h-full object-cover",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                                lineNumber: 161,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "a",
                                              {
                                                href: i.url,
                                                download: !0,
                                                target: "_blank",
                                                rel: "noopener noreferrer",
                                                className:
                                                  "absolute bottom-2 right-2 p-1.5 bg-black/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity",
                                                title: "Download high-res",
                                                children: e.jsxDEV(
                                                  v,
                                                  { className: "h-4 w-4" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                                    lineNumber: 170,
                                                    columnNumber: 25,
                                                  },
                                                  this,
                                                ),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                                lineNumber: 162,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        a,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                          lineNumber: 160,
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
                                      "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                    lineNumber: 158,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "p",
                                  {
                                    className:
                                      "text-xs text-muted-foreground mt-3",
                                    children:
                                      "High-resolution photos available for press use. Please credit appropriately.",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                    lineNumber: 175,
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
                                "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                              lineNumber: 156,
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
                        "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                      lineNumber: 145,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "space-y-8",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className:
                              "rounded-2xl border bg-card p-6 space-y-5",
                            children: [
                              e.jsxDEV(
                                "h3",
                                {
                                  className: "text-lg font-semibold",
                                  children: "Contact & Booking",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                  lineNumber: 185,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              s.contactEmail &&
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "space-y-1",
                                    children: [
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "text-xs text-muted-foreground uppercase tracking-wider font-medium",
                                          children: "General",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                          lineNumber: 189,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "a",
                                        {
                                          href: `mailto:${s.contactEmail}`,
                                          className:
                                            "flex items-center gap-2 text-sm text-primary hover:underline",
                                          children: [
                                            e.jsxDEV(
                                              n,
                                              {
                                                className:
                                                  "h-4 w-4 flex-shrink-0",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                                lineNumber: 192,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            s.contactEmail,
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                          lineNumber: 190,
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
                                      "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                    lineNumber: 188,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              s.bookingEmail &&
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "space-y-1",
                                    children: [
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "text-xs text-muted-foreground uppercase tracking-wider font-medium",
                                          children: "Booking",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                          lineNumber: 200,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "a",
                                        {
                                          href: `mailto:${s.bookingEmail}`,
                                          className:
                                            "flex items-center gap-2 text-sm text-primary hover:underline",
                                          children: [
                                            e.jsxDEV(
                                              n,
                                              {
                                                className:
                                                  "h-4 w-4 flex-shrink-0",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                                lineNumber: 203,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            s.bookingEmail,
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                          lineNumber: 201,
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
                                      "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                    lineNumber: 199,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              s.website &&
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "space-y-1",
                                    children: [
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "text-xs text-muted-foreground uppercase tracking-wider font-medium",
                                          children: "Website",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                          lineNumber: 211,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "a",
                                        {
                                          href: s.website,
                                          target: "_blank",
                                          rel: "noopener noreferrer",
                                          className:
                                            "flex items-center gap-2 text-sm text-primary hover:underline",
                                          children: [
                                            e.jsxDEV(
                                              k,
                                              {
                                                className:
                                                  "h-4 w-4 flex-shrink-0",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                                lineNumber: 214,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            s.website.replace(
                                              /^https?:\/\//,
                                              "",
                                            ),
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                          lineNumber: 212,
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
                                      "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                    lineNumber: 210,
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
                              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                            lineNumber: 184,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        (s.technicalRider || s.hospitality) &&
                          e.jsxDEV(
                            "div",
                            {
                              className:
                                "rounded-2xl border bg-card p-6 space-y-4",
                              children: [
                                e.jsxDEV(
                                  "h3",
                                  {
                                    className: "text-lg font-semibold",
                                    children: "Performance Requirements",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                    lineNumber: 223,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                s.technicalRider &&
                                  e.jsxDEV(
                                    "div",
                                    {
                                      children: [
                                        e.jsxDEV(
                                          "p",
                                          {
                                            className:
                                              "text-sm font-medium mb-2",
                                            children: "Technical Rider",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                            lineNumber: 227,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "p",
                                          {
                                            className:
                                              "text-sm text-muted-foreground whitespace-pre-wrap",
                                            children: s.technicalRider,
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                            lineNumber: 228,
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
                                        "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                      lineNumber: 226,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                s.hospitality &&
                                  e.jsxDEV(
                                    e.Fragment,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          c,
                                          {},
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                            lineNumber: 234,
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
                                                    "text-sm font-medium mb-2",
                                                  children: "Hospitality",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                                  lineNumber: 236,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-sm text-muted-foreground whitespace-pre-wrap",
                                                  children: s.hospitality,
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
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
                                              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
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
                                        "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                      lineNumber: 233,
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
                                "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                              lineNumber: 222,
                              columnNumber: 15,
                            },
                            this,
                          ),
                        e.jsxDEV(
                          "div",
                          {
                            className:
                              "rounded-2xl border bg-muted/30 p-5 text-center space-y-2",
                            children: [
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-xs text-muted-foreground",
                                  children: "Press kit powered by",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                  lineNumber: 245,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "a",
                                {
                                  href: "https://max-booster.com",
                                  target: "_blank",
                                  rel: "noopener noreferrer",
                                  className:
                                    "text-sm font-semibold text-primary hover:underline flex items-center justify-center gap-1",
                                  children: [
                                    "Max Booster ",
                                    e.jsxDEV(
                                      E,
                                      { className: "h-3 w-3" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                        lineNumber: 250,
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
                                    "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                                  lineNumber: 248,
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
                              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                            lineNumber: 244,
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
                        "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
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
                  "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
                lineNumber: 143,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
            lineNumber: 142,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    !0,
    {
      fileName: "/home/runner/workspace/client/src/pages/PublicPressKit.tsx",
      lineNumber: 66,
      columnNumber: 5,
    },
    this,
  );
}
export { R as default };
