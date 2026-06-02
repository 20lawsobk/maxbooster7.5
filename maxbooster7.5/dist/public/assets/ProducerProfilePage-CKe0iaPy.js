import {
  dd as _,
  ag as z,
  r as g,
  ah as J,
  aI as j,
  aH as b,
  f as e,
  aL as U,
  cy as q,
  b$ as E,
  dS as X,
  cY as Z,
  eq as ee,
  dW as re,
  cT as se,
  aO as D,
  cU as ie,
  dc as $,
  aM as M,
  dC as A,
  cc as le,
  fK as oe,
  bI as ae,
  ap as ne,
} from "./vendor-react-31oK5L0i.js";
import {
  u as ce,
  j as f,
  C as n,
  h as c,
  B as te,
  a4 as ue,
  a5 as me,
  a6 as I,
  a9 as K,
  d as de,
  f as fe,
  x as Ne,
  o as he,
  p as pe,
  r as Pe,
  v as ge,
  a as u,
} from "./studio-DOUfHW5v.js";
import { c as be } from "./useRequireAuth-K5x5riUd.js";
import { A as V } from "./AppLayout-D2pri0rw.js";
import { B as xe } from "./BeatCard-D-KiA6Hx.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
import "./index-D5xLbTBZ.js";
import "./TopBar-jcH3P98k.js";
const R = [
  {
    licenseType: "basic",
    label: "Basic License",
    description: "MP3 download, up to 100k streams",
    fileFormats: ["mp3"],
    multiplier: 1,
    icon: "file",
  },
  {
    licenseType: "premium",
    label: "Premium License",
    description: "WAV + MP3, up to 500k streams",
    fileFormats: ["mp3", "wav"],
    multiplier: 1.5,
    icon: "star",
  },
  {
    licenseType: "unlimited",
    label: "Unlimited License",
    description: "WAV + MP3 + Stems, unlimited streams",
    fileFormats: ["mp3", "wav", "stems"],
    multiplier: 2,
    icon: "infinity",
  },
  {
    licenseType: "exclusive",
    label: "Exclusive Rights",
    description: "Full ownership transfer, beat removed from store",
    fileFormats: ["mp3", "wav", "stems"],
    multiplier: 5,
    icon: "lock",
  },
];
function Le() {
  const { isLoading: Q } = be(),
    l = _().producerId,
    [, x] = z(),
    [y, w] = g.useState(null),
    m = g.useRef(null),
    { toast: t } = ce(),
    N = J(),
    [o, h] = g.useState(null),
    [v, C] = g.useState("basic"),
    p = j({
      mutationFn: async ({ beatId: r, licenseType: i }) =>
        (
          await u("POST", "/api/marketplace/purchase", {
            beatId: r,
            licenseType: i,
          })
        ).json(),
      onSuccess: (r) => {
        r.url
          ? (window.location.href = r.url)
          : (t({
              title: "Purchase Successful!",
              description: `You've successfully purchased "${o?.title}". Check your purchases for the download link.`,
            }),
            h(null),
            N.invalidateQueries({ queryKey: ["/api/marketplace/purchases"] }));
      },
      onError: (r) => {
        t({
          title: "Purchase Failed",
          description: r?.message || "Something went wrong. Please try again.",
          variant: "destructive",
        });
      },
    }),
    { data: d } = b({
      queryKey: ["producer-follow-status", l],
      queryFn: async () =>
        (
          await u("GET", `/api/marketplace/producers/${l}/follow-status`)
        ).json(),
      enabled: !!l,
    }),
    F = j({
      mutationFn: async () =>
        (await u("POST", `/api/marketplace/follow/${l}`)).json(),
      onSuccess: () => {
        (N.invalidateQueries({ queryKey: ["producer-follow-status", l] }),
          N.invalidateQueries({ queryKey: ["producer", l] }),
          t({
            title: d?.isFollowing ? "Unfollowed" : "Following!",
            description: d?.isFollowing
              ? "You unfollowed this producer"
              : "You are now following this producer",
          }));
      },
    }),
    T = j({
      mutationFn: async () =>
        (await u("POST", `/api/marketplace/unfollow/${l}`)).json(),
      onSuccess: () => {
        (N.invalidateQueries({ queryKey: ["producer-follow-status", l] }),
          N.invalidateQueries({ queryKey: ["producer", l] }),
          t({
            title: "Unfollowed",
            description: "You unfollowed this producer",
          }));
      },
    }),
    { data: s, isLoading: W } = b({
      queryKey: ["producer", l],
      queryFn: async () =>
        (await u("GET", `/api/marketplace/producers/${l}`)).json(),
      enabled: !!l,
    }),
    { data: S, isLoading: O } = b({
      queryKey: ["producer-beats", l],
      queryFn: async () =>
        (await u("GET", `/api/marketplace/beats?producerId=${l}`)).json(),
      enabled: !!l,
    }),
    P = Array.isArray(S) ? S : [],
    { data: Y } = b({
      queryKey: ["all-producers"],
      queryFn: async () =>
        (await u("GET", "/api/marketplace/producers")).json(),
      enabled: !!l,
      staleTime: 300 * 1e3,
    }),
    L = Y?.producers || [],
    G = (r) => {
      if (y === r.id) (m.current?.pause(), w(null));
      else {
        m.current && m.current.pause();
        const i = r.audioPreview || r.audioUrl || r.previewUrl;
        if (i) {
          const a = i.startsWith("http")
            ? i
            : `${window.location.origin}${i.startsWith("/") ? i : "/" + i}`;
          ((m.current = new Audio(a)),
            m.current.play().catch(() => {}),
            w(r.id),
            (m.current.onended = () => w(null)));
        } else
          t({
            title: "Preview unavailable",
            description: "No audio preview for this beat.",
            variant: "destructive",
          });
      }
    },
    B = (r, i) => {
      const a = r.licenseOptions?.find((k) => k.licenseType === i);
      if (a) return a.priceCents / 100;
      const H = R.find((k) => k.licenseType === i);
      return r.price * (H?.multiplier || 1);
    };
  return Q || W
    ? e.jsxDEV(
        V,
        {
          children: e.jsxDEV(
            "div",
            {
              className: "flex items-center justify-center h-96",
              children: e.jsxDEV(
                U,
                { className: "w-8 h-8 animate-spin text-muted-foreground" },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                  lineNumber: 214,
                  columnNumber: 11,
                },
                this,
              ),
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
              lineNumber: 213,
              columnNumber: 9,
            },
            this,
          ),
        },
        void 0,
        !1,
        {
          fileName:
            "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
          lineNumber: 212,
          columnNumber: 7,
        },
        this,
      )
    : s
      ? e.jsxDEV(
          V,
          {
            children: [
              e.jsxDEV(
                "div",
                {
                  className: "space-y-6",
                  children: [
                    e.jsxDEV(
                      f,
                      {
                        variant: "ghost",
                        onClick: () => x("/marketplace"),
                        className: "mb-4",
                        children: [
                          e.jsxDEV(
                            q,
                            { className: "w-4 h-4 mr-2" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                              lineNumber: 239,
                              columnNumber: 11,
                            },
                            this,
                          ),
                          "Back to Marketplace",
                        ],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                        lineNumber: 238,
                        columnNumber: 9,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      n,
                      {
                        className: "overflow-hidden",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              className:
                                "h-32 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                              lineNumber: 244,
                              columnNumber: 11,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            c,
                            {
                              className: "relative pt-0",
                              children: e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "flex flex-col md:flex-row items-start md:items-end gap-6 -mt-16",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "relative",
                                        children: [
                                          s.avatarUrl
                                            ? e.jsxDEV(
                                                "img",
                                                {
                                                  src: s.avatarUrl,
                                                  alt: s.name || s.username,
                                                  className:
                                                    "w-32 h-32 rounded-full border-4 border-background object-cover shadow-xl",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 249,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              )
                                            : e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "w-32 h-32 rounded-full border-4 border-background bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl font-bold shadow-xl",
                                                  children:
                                                    (s.name || s.username)
                                                      ?.substring(0, 2)
                                                      ?.toUpperCase() || "PR",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 255,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                          s.verified &&
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "absolute bottom-2 right-2 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white",
                                                children: e.jsxDEV(
                                                  E,
                                                  {
                                                    className:
                                                      "w-5 h-5 text-white",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                    lineNumber: 261,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                lineNumber: 260,
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
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 247,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "flex-1 pb-4",
                                        children: [
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "flex items-center gap-3 mb-2",
                                              children: [
                                                e.jsxDEV(
                                                  "h1",
                                                  {
                                                    className:
                                                      "text-3xl font-bold",
                                                    children:
                                                      s.name || s.username,
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                    lineNumber: 268,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                s.verified &&
                                                  e.jsxDEV(
                                                    te,
                                                    {
                                                      className: "bg-blue-600",
                                                      children: [
                                                        e.jsxDEV(
                                                          E,
                                                          {
                                                            className:
                                                              "w-3 h-3 mr-1",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                            lineNumber: 271,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        "Verified",
                                                      ],
                                                    },
                                                    void 0,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                      lineNumber: 270,
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
                                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                              lineNumber: 267,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          s.bio &&
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-muted-foreground mb-3 max-w-2xl",
                                                children: s.bio,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                lineNumber: 278,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "flex flex-wrap gap-4 text-sm text-muted-foreground",
                                              children: [
                                                s.location &&
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex items-center gap-1",
                                                      children: [
                                                        e.jsxDEV(
                                                          X,
                                                          {
                                                            className:
                                                              "w-4 h-4",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                            lineNumber: 284,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        s.location,
                                                      ],
                                                    },
                                                    void 0,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                      lineNumber: 283,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                s.website &&
                                                  e.jsxDEV(
                                                    "a",
                                                    {
                                                      href: s.website,
                                                      target: "_blank",
                                                      rel: "noopener noreferrer",
                                                      className:
                                                        "flex items-center gap-1 hover:text-blue-500 transition",
                                                      children: [
                                                        e.jsxDEV(
                                                          Z,
                                                          {
                                                            className:
                                                              "w-4 h-4",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                            lineNumber: 295,
                                                            columnNumber: 23,
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
                                                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                      lineNumber: 289,
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
                                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                              lineNumber: 281,
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
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 266,
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
                                            f,
                                            {
                                              className: d?.isFollowing
                                                ? ""
                                                : "bg-gradient-to-r from-blue-600 to-purple-600",
                                              variant: d?.isFollowing
                                                ? "outline"
                                                : "default",
                                              onClick: () =>
                                                d?.isFollowing
                                                  ? T.mutate()
                                                  : F.mutate(),
                                              disabled:
                                                F.isPending || T.isPending,
                                              children: d?.isFollowing
                                                ? e.jsxDEV(
                                                    e.Fragment,
                                                    {
                                                      children: [
                                                        e.jsxDEV(
                                                          ee,
                                                          {
                                                            className:
                                                              "w-4 h-4 mr-2",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                            lineNumber: 310,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        " Following",
                                                      ],
                                                    },
                                                    void 0,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                      lineNumber: 310,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  )
                                                : e.jsxDEV(
                                                    e.Fragment,
                                                    {
                                                      children: [
                                                        e.jsxDEV(
                                                          re,
                                                          {
                                                            className:
                                                              "w-4 h-4 mr-2",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                            lineNumber: 312,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        " Follow",
                                                      ],
                                                    },
                                                    void 0,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                      lineNumber: 312,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                              lineNumber: 303,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            f,
                                            {
                                              variant: "outline",
                                              onClick: () => {
                                                const r = `${window.location.origin}/marketplace/producer/${l}`,
                                                  i = {
                                                    title: `${s.displayName || s.username} on Max Booster`,
                                                    url: r,
                                                  };
                                                navigator.share
                                                  ? navigator
                                                      .share(i)
                                                      .catch(() => {})
                                                  : navigator.clipboard
                                                      .writeText(r)
                                                      .then(() => {
                                                        t({
                                                          title: "Link copied!",
                                                          description:
                                                            "Producer profile link copied to clipboard",
                                                        });
                                                      })
                                                      .catch(() => {
                                                        t({
                                                          title:
                                                            "Could not copy link",
                                                          variant:
                                                            "destructive",
                                                        });
                                                      });
                                              },
                                              children: e.jsxDEV(
                                                se,
                                                { className: "w-4 h-4" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 328,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                              lineNumber: 315,
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
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
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
                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                  lineNumber: 246,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                              lineNumber: 245,
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
                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                        lineNumber: 243,
                        columnNumber: 9,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className: "grid grid-cols-2 md:grid-cols-4 gap-4",
                        children: [
                          e.jsxDEV(
                            n,
                            {
                              children: e.jsxDEV(
                                c,
                                {
                                  className: "p-4 text-center",
                                  children: [
                                    e.jsxDEV(
                                      D,
                                      {
                                        className:
                                          "w-8 h-8 mx-auto mb-2 text-blue-500",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 338,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "p",
                                      {
                                        className: "text-2xl font-bold",
                                        children:
                                          s.beatCount ||
                                          s.beats ||
                                          P.length ||
                                          0,
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 339,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "p",
                                      {
                                        className:
                                          "text-sm text-muted-foreground",
                                        children: "Beats",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 340,
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
                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                  lineNumber: 337,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                              lineNumber: 336,
                              columnNumber: 11,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            n,
                            {
                              children: e.jsxDEV(
                                c,
                                {
                                  className: "p-4 text-center",
                                  children: [
                                    e.jsxDEV(
                                      ie,
                                      {
                                        className:
                                          "w-8 h-8 mx-auto mb-2 text-green-500",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 345,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "p",
                                      {
                                        className: "text-2xl font-bold",
                                        children: s.sales || 0,
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 346,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "p",
                                      {
                                        className:
                                          "text-sm text-muted-foreground",
                                        children: "Sales",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 347,
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
                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                  lineNumber: 344,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                              lineNumber: 343,
                              columnNumber: 11,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            n,
                            {
                              children: e.jsxDEV(
                                c,
                                {
                                  className: "p-4 text-center",
                                  children: [
                                    e.jsxDEV(
                                      $,
                                      {
                                        className:
                                          "w-8 h-8 mx-auto mb-2 text-purple-500",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 352,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "p",
                                      {
                                        className: "text-2xl font-bold",
                                        children:
                                          s.followerCount || s.followers || 0,
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 353,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "p",
                                      {
                                        className:
                                          "text-sm text-muted-foreground",
                                        children: "Followers",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 354,
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
                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                  lineNumber: 351,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                              lineNumber: 350,
                              columnNumber: 11,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            n,
                            {
                              children: e.jsxDEV(
                                c,
                                {
                                  className: "p-4 text-center",
                                  children: [
                                    e.jsxDEV(
                                      M,
                                      {
                                        className:
                                          "w-8 h-8 mx-auto mb-2 text-yellow-500",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 359,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "p",
                                      {
                                        className: "text-2xl font-bold",
                                        children: (s.rating || 0).toFixed(1),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 360,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "p",
                                      {
                                        className:
                                          "text-sm text-muted-foreground",
                                        children: "Rating",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
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
                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                  lineNumber: 358,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                              lineNumber: 357,
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
                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                        lineNumber: 335,
                        columnNumber: 9,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      ue,
                      {
                        defaultValue: "beats",
                        className: "w-full",
                        children: [
                          e.jsxDEV(
                            me,
                            {
                              children: [
                                e.jsxDEV(
                                  I,
                                  {
                                    value: "beats",
                                    children: ["Beats (", P.length, ")"],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                    lineNumber: 368,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  I,
                                  { value: "about", children: "About" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                    lineNumber: 369,
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
                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                              lineNumber: 367,
                              columnNumber: 11,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            K,
                            {
                              value: "beats",
                              className: "mt-6",
                              children: O
                                ? e.jsxDEV(
                                    "div",
                                    {
                                      className: "flex justify-center py-12",
                                      children: e.jsxDEV(
                                        U,
                                        {
                                          className:
                                            "w-8 h-8 animate-spin text-muted-foreground",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                          lineNumber: 375,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                      lineNumber: 374,
                                      columnNumber: 15,
                                    },
                                    this,
                                  )
                                : P.length > 0
                                  ? e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
                                        children: P.map((r) =>
                                          e.jsxDEV(
                                            xe,
                                            {
                                              beat: r,
                                              mode: "buy",
                                              isPlaying: y === r.id,
                                              onPlayToggle: (i) => G(i),
                                              onBuy: (i) => {
                                                (C("basic"), h(i));
                                              },
                                            },
                                            r.id,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                              lineNumber: 380,
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
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 378,
                                        columnNumber: 15,
                                      },
                                      this,
                                    )
                                  : e.jsxDEV(
                                      n,
                                      {
                                        children: e.jsxDEV(
                                          c,
                                          {
                                            className: "p-12 text-center",
                                            children: [
                                              e.jsxDEV(
                                                D,
                                                {
                                                  className:
                                                    "w-16 h-16 mx-auto mb-4 text-muted-foreground",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 396,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "h3",
                                                {
                                                  className:
                                                    "text-xl font-semibold mb-2",
                                                  children: "No Beats Yet",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 397,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-muted-foreground",
                                                  children:
                                                    "This producer hasn't uploaded any beats yet.",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 398,
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
                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                            lineNumber: 395,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 394,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                              lineNumber: 372,
                              columnNumber: 11,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            K,
                            {
                              value: "about",
                              className: "mt-6",
                              children: e.jsxDEV(
                                n,
                                {
                                  children: [
                                    e.jsxDEV(
                                      de,
                                      {
                                        children: e.jsxDEV(
                                          fe,
                                          {
                                            children: [
                                              "About ",
                                              s.name || s.username,
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                            lineNumber: 407,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 406,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      c,
                                      {
                                        className: "space-y-4",
                                        children: [
                                          s.bio
                                            ? e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-muted-foreground",
                                                  children: s.bio,
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 411,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              )
                                            : e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-muted-foreground italic",
                                                  children: "No bio available.",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 413,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                          e.jsxDEV(
                                            Ne,
                                            {},
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                              lineNumber: 415,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "grid grid-cols-2 gap-4",
                                              children: [
                                                s.location &&
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      children: [
                                                        e.jsxDEV(
                                                          "p",
                                                          {
                                                            className:
                                                              "text-sm font-medium",
                                                            children:
                                                              "Location",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                            lineNumber: 419,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "p",
                                                          {
                                                            className:
                                                              "text-muted-foreground",
                                                            children:
                                                              s.location,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                            lineNumber: 420,
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
                                                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                      lineNumber: 418,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                s.website &&
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      children: [
                                                        e.jsxDEV(
                                                          "p",
                                                          {
                                                            className:
                                                              "text-sm font-medium",
                                                            children: "Website",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                            lineNumber: 425,
                                                            columnNumber: 23,
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
                                                              "text-blue-500 hover:underline",
                                                            children: s.website,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
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
                                                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                      lineNumber: 424,
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
                                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                              lineNumber: 416,
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
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 409,
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
                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                  lineNumber: 405,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                              lineNumber: 404,
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
                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                        lineNumber: 366,
                        columnNumber: 9,
                      },
                      this,
                    ),
                    L.length > 1 &&
                      e.jsxDEV(
                        "div",
                        {
                          className: "mt-8 space-y-4",
                          children: [
                            e.jsxDEV(
                              "h3",
                              {
                                className:
                                  "text-xl font-bold flex items-center gap-2",
                                children: [
                                  e.jsxDEV(
                                    $,
                                    { className: "w-5 h-5 text-purple-500" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                      lineNumber: 445,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  "Similar Producers",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                lineNumber: 444,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "p",
                              {
                                className: "text-sm text-muted-foreground",
                                children: [
                                  "If you like ",
                                  s.name || s.username,
                                  ", you might also enjoy these producers",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                lineNumber: 448,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className:
                                  "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
                                children: L.filter((r) => r.id !== l)
                                  .slice(0, 6)
                                  .map((r) =>
                                    e.jsxDEV(
                                      n,
                                      {
                                        className:
                                          "hover:shadow-xl transition group cursor-pointer border-2 hover:border-blue-500",
                                        onClick: () =>
                                          x(`/marketplace/producer/${r.id}`),
                                        children: e.jsxDEV(
                                          c,
                                          {
                                            className: "p-4",
                                            children: e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex items-center gap-4",
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "relative flex-shrink-0",
                                                      children: [
                                                        r.avatar || r.avatarUrl
                                                          ? e.jsxDEV(
                                                              "img",
                                                              {
                                                                src:
                                                                  r.avatar ||
                                                                  r.avatarUrl,
                                                                alt:
                                                                  r.displayName ||
                                                                  r.username ||
                                                                  "Producer",
                                                                className:
                                                                  "w-14 h-14 rounded-full object-cover border-2 border-purple-500/30",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                                lineNumber: 465,
                                                                columnNumber: 29,
                                                              },
                                                              this,
                                                            )
                                                          : e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold",
                                                                children: (
                                                                  r.displayName ||
                                                                  r.username ||
                                                                  "PR"
                                                                )
                                                                  .substring(
                                                                    0,
                                                                    2,
                                                                  )
                                                                  .toUpperCase(),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                                lineNumber: 471,
                                                                columnNumber: 29,
                                                              },
                                                              this,
                                                            ),
                                                        r.verified &&
                                                          e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white",
                                                              children:
                                                                e.jsxDEV(
                                                                  E,
                                                                  {
                                                                    className:
                                                                      "w-3 h-3 text-white",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                                    lineNumber: 477,
                                                                    columnNumber: 31,
                                                                  },
                                                                  this,
                                                                ),
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                              lineNumber: 476,
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
                                                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                      lineNumber: 463,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex-1 min-w-0",
                                                      children: [
                                                        e.jsxDEV(
                                                          "h4",
                                                          {
                                                            className:
                                                              "font-bold truncate group-hover:text-blue-600 transition",
                                                            children:
                                                              r.displayName ||
                                                              r.username,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                            lineNumber: 482,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        r.bio &&
                                                          e.jsxDEV(
                                                            "p",
                                                            {
                                                              className:
                                                                "text-xs text-muted-foreground truncate",
                                                              children: r.bio,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                              lineNumber: 486,
                                                              columnNumber: 29,
                                                            },
                                                            this,
                                                          ),
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "flex items-center gap-3 mt-1 text-xs text-muted-foreground",
                                                            children: [
                                                              e.jsxDEV(
                                                                "span",
                                                                {
                                                                  children: [
                                                                    r.beats ||
                                                                      r.beatCount ||
                                                                      0,
                                                                    " beats",
                                                                  ],
                                                                },
                                                                void 0,
                                                                !0,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                                  lineNumber: 489,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "span",
                                                                {
                                                                  children: [
                                                                    r.followers ||
                                                                      r.followerCount ||
                                                                      0,
                                                                    " followers",
                                                                  ],
                                                                },
                                                                void 0,
                                                                !0,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                                  lineNumber: 490,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              (r.rating || 0) >
                                                                0 &&
                                                                e.jsxDEV(
                                                                  "span",
                                                                  {
                                                                    children:
                                                                      "★".repeat(
                                                                        Math.round(
                                                                          r.rating,
                                                                        ),
                                                                      ),
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                                    lineNumber: 491,
                                                                    columnNumber: 53,
                                                                  },
                                                                  this,
                                                                ),
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                            lineNumber: 488,
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
                                                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                      lineNumber: 481,
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
                                                  "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                lineNumber: 462,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                            lineNumber: 461,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      r.id,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                        lineNumber: 456,
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
                                  "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                lineNumber: 451,
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
                            "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                          lineNumber: 443,
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
                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                  lineNumber: 237,
                  columnNumber: 7,
                },
                this,
              ),
              e.jsxDEV(
                he,
                {
                  open: !!o,
                  onOpenChange: (r) => {
                    r || h(null);
                  },
                  children: e.jsxDEV(
                    pe,
                    {
                      className: "max-w-lg",
                      children: [
                        e.jsxDEV(
                          Pe,
                          {
                            children: e.jsxDEV(
                              ge,
                              {
                                className: "flex items-center gap-2",
                                children: [
                                  e.jsxDEV(
                                    A,
                                    { className: "w-5 h-5" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                      lineNumber: 508,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  "Purchase License",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                lineNumber: 507,
                                columnNumber: 13,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                            lineNumber: 506,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        o &&
                          e.jsxDEV(
                            "div",
                            {
                              className: "space-y-4",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "flex items-center gap-3 p-3 bg-muted rounded-lg",
                                    children: [
                                      o.coverArt
                                        ? e.jsxDEV(
                                            "img",
                                            {
                                              src: o.coverArt,
                                              alt: o.title,
                                              className:
                                                "w-14 h-14 rounded object-cover flex-shrink-0",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                              lineNumber: 517,
                                              columnNumber: 19,
                                            },
                                            this,
                                          )
                                        : e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "w-14 h-14 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0",
                                              children: e.jsxDEV(
                                                D,
                                                {
                                                  className:
                                                    "w-7 h-7 text-white opacity-70",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 520,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                              lineNumber: 519,
                                              columnNumber: 19,
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
                                                className: "font-semibold",
                                                children: o.title,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                lineNumber: 524,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-sm text-muted-foreground",
                                                children: [
                                                  o.genre,
                                                  " • ",
                                                  o.bpm || o.tempo,
                                                  " BPM • ",
                                                  o.key,
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                lineNumber: 525,
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
                                            "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                          lineNumber: 523,
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
                                      "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                    lineNumber: 515,
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
                                        "p",
                                        {
                                          className:
                                            "text-sm font-medium text-muted-foreground uppercase tracking-wide",
                                          children: "Select License",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                          lineNumber: 530,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      R.map((r) => {
                                        const i = B(o, r.licenseType),
                                          a = v === r.licenseType;
                                        return e.jsxDEV(
                                          "button",
                                          {
                                            onClick: () => C(r.licenseType),
                                            className: `w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${a ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-border hover:border-blue-300 hover:bg-muted/50"}`,
                                            children: [
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className: `w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${a ? "bg-blue-500 text-white" : "bg-muted"}`,
                                                  children: [
                                                    r.icon === "file" &&
                                                      e.jsxDEV(
                                                        le,
                                                        {
                                                          className: "w-4 h-4",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                          lineNumber: 545,
                                                          columnNumber: 53,
                                                        },
                                                        this,
                                                      ),
                                                    r.icon === "star" &&
                                                      e.jsxDEV(
                                                        M,
                                                        {
                                                          className: "w-4 h-4",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                          lineNumber: 546,
                                                          columnNumber: 53,
                                                        },
                                                        this,
                                                      ),
                                                    r.icon === "infinity" &&
                                                      e.jsxDEV(
                                                        oe,
                                                        {
                                                          className: "w-4 h-4",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                          lineNumber: 547,
                                                          columnNumber: 57,
                                                        },
                                                        this,
                                                      ),
                                                    r.icon === "lock" &&
                                                      e.jsxDEV(
                                                        ae,
                                                        {
                                                          className: "w-4 h-4",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                          lineNumber: 548,
                                                          columnNumber: 53,
                                                        },
                                                        this,
                                                      ),
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 544,
                                                  columnNumber: 23,
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
                                                      {
                                                        className:
                                                          "font-medium text-sm",
                                                        children: r.label,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                        lineNumber: 551,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className:
                                                          "text-xs text-muted-foreground",
                                                        children: r.description,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                        lineNumber: 552,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className:
                                                          "text-xs text-muted-foreground mt-0.5",
                                                        children: r.fileFormats
                                                          .join(", ")
                                                          .toUpperCase(),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                        lineNumber: 553,
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
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 550,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className:
                                                    "font-bold text-green-600 flex-shrink-0",
                                                  children: ["$", i.toFixed(2)],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 555,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                            ],
                                          },
                                          r.licenseType,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                            lineNumber: 535,
                                            columnNumber: 21,
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
                                      "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                    lineNumber: 529,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex gap-2 pt-2",
                                    children: [
                                      e.jsxDEV(
                                        f,
                                        {
                                          variant: "outline",
                                          className: "flex-1",
                                          onClick: () => h(null),
                                          disabled: p.isPending,
                                          children: "Cancel",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                          lineNumber: 562,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        f,
                                        {
                                          className:
                                            "flex-1 bg-gradient-to-r from-blue-600 to-purple-600",
                                          disabled: p.isPending,
                                          onClick: () =>
                                            p.mutate({
                                              beatId: o.id,
                                              licenseType: v,
                                            }),
                                          children: p.isPending
                                            ? e.jsxDEV(
                                                e.Fragment,
                                                {
                                                  children: [
                                                    e.jsxDEV(
                                                      ne,
                                                      {
                                                        className:
                                                          "w-4 h-4 mr-2 animate-spin",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                        lineNumber: 571,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    " Processing...",
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 571,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              )
                                            : e.jsxDEV(
                                                e.Fragment,
                                                {
                                                  children: [
                                                    e.jsxDEV(
                                                      A,
                                                      {
                                                        className:
                                                          "w-4 h-4 mr-2",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                        lineNumber: 573,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    " Purchase for $",
                                                    B(o, v).toFixed(2),
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                                  lineNumber: 573,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                          lineNumber: 565,
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
                                      "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                                    lineNumber: 561,
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
                                "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                              lineNumber: 514,
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
                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                      lineNumber: 505,
                      columnNumber: 9,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                  lineNumber: 504,
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
              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
            lineNumber: 236,
            columnNumber: 5,
          },
          this,
        )
      : e.jsxDEV(
          V,
          {
            children: e.jsxDEV(
              "div",
              {
                className:
                  "flex flex-col items-center justify-center h-96 space-y-4",
                children: [
                  e.jsxDEV(
                    "h2",
                    {
                      className: "text-2xl font-bold",
                      children: "Producer Not Found",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                      lineNumber: 224,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "p",
                    {
                      className: "text-muted-foreground",
                      children:
                        "The producer you're looking for doesn't exist.",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                      lineNumber: 225,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    f,
                    {
                      onClick: () => x("/marketplace"),
                      children: [
                        e.jsxDEV(
                          q,
                          { className: "w-4 h-4 mr-2" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                            lineNumber: 227,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        "Back to Marketplace",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                      lineNumber: 226,
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
                  "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
                lineNumber: 223,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/pages/ProducerProfilePage.tsx",
            lineNumber: 222,
            columnNumber: 7,
          },
          this,
        );
}
export { Le as default };
