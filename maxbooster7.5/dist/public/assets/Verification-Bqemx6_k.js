import {
  ag as fe,
  ah as he,
  r as N,
  aH as ae,
  aI as W,
  f as e,
  b$ as _,
  cv as re,
  cc as d,
  a_ as $,
  ao as Q,
  aL as se,
  bb as te,
  cB as me,
  d1 as ue,
  ds as pe,
  ap as O,
  al as ne,
  c4 as xe,
  fp as be,
  de as Ve,
  bK as ge,
  ac as ve,
} from "./vendor-react-31oK5L0i.js";
import {
  u as de,
  k as G,
  C as y,
  d as C,
  f as S,
  g as q,
  h as I,
  j as D,
  P as Y,
  a4 as we,
  a5 as ke,
  a6 as ce,
  a9 as le,
  L as o,
  I as f,
  W as H,
  X as Z,
  Y as ee,
  Z as ie,
  $ as u,
  B as K,
} from "./studio-DOUfHW5v.js";
import { a as je } from "./index-D5xLbTBZ.js";
import { A as De } from "./AppLayout-D2pri0rw.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
import "./TopBar-jcH3P98k.js";
function Be() {
  const { user: t } = je(),
    [, P] = fe(),
    { toast: h } = de(),
    V = he(),
    [g, U] = N.useState("individual"),
    [w, l] = N.useState(1),
    [c, J] = N.useState(null),
    [M, k] = N.useState({}),
    [a, p] = N.useState({
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      nationality: "",
      address: "",
      city: "",
      state: "",
      postalCode: "",
      country: "US",
    }),
    [n, v] = N.useState({
      businessName: "",
      businessType: "",
      businessRegistrationNumber: "",
      taxIdNumber: "",
      address: "",
      city: "",
      state: "",
      postalCode: "",
      country: "US",
    }),
    { data: r, isLoading: B } = ae({
      queryKey: ["/api/kyc/status"],
      enabled: !!t,
    }),
    { data: T } = ae({
      queryKey: ["/api/kyc/documents"],
      enabled: !!t && !!r?.verificationId,
    });
  N.useEffect(() => {
    !r ||
      B ||
      (r.verificationType && U(r.verificationType),
      r.status === "not_started" || !r.verificationId
        ? l(1)
        : r.status === "pending"
          ? r.infoSubmitted
            ? r.allDocumentsUploaded
              ? l(4)
              : l(3)
            : l(2)
          : r.status === "under_review" || r.status === "verified"
            ? l(4)
            : r.status === "rejected" && l(1));
  }, [r, B]);
  const F = W({
      mutationFn: async (i) => {
        const s = G(),
          m = await fetch("/api/kyc/start", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(s ? { "x-csrf-token": s } : {}),
            },
            credentials: "include",
            body: JSON.stringify({ type: i, level: "enhanced" }),
          });
        if (!m.ok) {
          const b = await m.json();
          throw new Error(b.error || "Failed to start verification");
        }
        return m.json();
      },
      onSuccess: (i) => {
        (J(i.verification.id),
          V.invalidateQueries({ queryKey: ["/api/kyc/status"] }),
          l(2),
          h({
            title: "Verification started",
            description: "Please provide your information.",
          }));
      },
      onError: (i) => {
        h({ title: "Error", description: i.message, variant: "destructive" });
      },
    }),
    A = W({
      mutationFn: async () => {
        const i = c || r?.verificationId;
        if (!i) throw new Error("No verification in progress");
        const s =
            g === "individual" ? "/api/kyc/individual" : "/api/kyc/business",
          m =
            g === "individual"
              ? { verificationId: i, ...a }
              : { verificationId: i, ...n },
          b = G(),
          E = await fetch(s, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...(b ? { "x-csrf-token": b } : {}),
            },
            credentials: "include",
            body: JSON.stringify(m),
          });
        if (!E.ok) {
          const Ne = await E.json();
          throw new Error(Ne.error || "Failed to submit information");
        }
        return E.json();
      },
      onSuccess: () => {
        (V.invalidateQueries({ queryKey: ["/api/kyc/status"] }),
          l(3),
          h({
            title: "Information saved",
            description: "Please upload your documents.",
          }));
      },
      onError: (i) => {
        h({ title: "Error", description: i.message, variant: "destructive" });
      },
    }),
    z = W({
      mutationFn: async () => {
        const i = c || r?.verificationId;
        if (!i) throw new Error("No verification in progress");
        const s = G(),
          m = await fetch("/api/kyc/submit", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(s ? { "x-csrf-token": s } : {}),
            },
            credentials: "include",
            body: JSON.stringify({ verificationId: i }),
          });
        if (!m.ok) {
          const b = await m.json();
          throw new Error(b.error || "Failed to submit for review");
        }
        return m.json();
      },
      onSuccess: () => {
        (V.invalidateQueries({ queryKey: ["/api/kyc/status"] }),
          l(4),
          h({
            title: "Submitted for review",
            description:
              "Your verification is being reviewed. This typically takes 1-2 business days.",
          }));
      },
      onError: (i) => {
        h({ title: "Error", description: i.message, variant: "destructive" });
      },
    });
  if (!t) return (P("/login"), null);
  const j = c || r?.verificationId,
    R = () => {
      const i = r?.status || "not_started",
        s = {
          not_started: {
            variant: "outline",
            icon: e.jsxDEV(
              $,
              { className: "h-3 w-3" },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                lineNumber: 272,
                columnNumber: 48,
              },
              this,
            ),
            label: "Not Started",
          },
          pending: {
            variant: "secondary",
            icon: e.jsxDEV(
              $,
              { className: "h-3 w-3" },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                lineNumber: 273,
                columnNumber: 46,
              },
              this,
            ),
            label: "Pending Documents",
          },
          under_review: {
            variant: "secondary",
            icon: e.jsxDEV(
              d,
              { className: "h-3 w-3" },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                lineNumber: 274,
                columnNumber: 51,
              },
              this,
            ),
            label: "Under Review",
          },
          verified: {
            variant: "default",
            icon: e.jsxDEV(
              _,
              { className: "h-3 w-3" },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                lineNumber: 275,
                columnNumber: 45,
              },
              this,
            ),
            label: "Verified",
          },
          rejected: {
            variant: "destructive",
            icon: e.jsxDEV(
              Q,
              { className: "h-3 w-3" },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                lineNumber: 276,
                columnNumber: 49,
              },
              this,
            ),
            label: "Rejected",
          },
          expired: {
            variant: "destructive",
            icon: e.jsxDEV(
              Q,
              { className: "h-3 w-3" },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                lineNumber: 277,
                columnNumber: 48,
              },
              this,
            ),
            label: "Expired",
          },
        },
        { variant: m, icon: b, label: E } = s[i] || s.not_started;
      return e.jsxDEV(
        K,
        { variant: m, className: "flex items-center gap-1", children: [b, E] },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Verification.tsx",
          lineNumber: 281,
          columnNumber: 7,
        },
        this,
      );
    },
    x = () => {
      if (!r || r.status === "not_started") return 0;
      if (r.status === "verified") return 100;
      const i = r.documentsRequired?.length || 3,
        s = r.documentsSubmitted?.length || 0,
        m = w >= 3 ? 1 : 0,
        b = i + 2,
        E = m + s + (r.status === "under_review" ? 1 : 0);
      return Math.min(Math.round((E / b) * 100), 95);
    },
    X = () =>
      B
        ? e.jsxDEV(
            "div",
            {
              className:
                "min-h-screen bg-background flex items-center justify-center",
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
                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                  lineNumber: 306,
                  columnNumber: 11,
                },
                this,
              ),
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/Verification.tsx",
              lineNumber: 305,
              columnNumber: 9,
            },
            this,
          )
        : r?.status === "verified"
          ? e.jsxDEV(
              "div",
              {
                className: "max-w-2xl mx-auto",
                children: e.jsxDEV(
                  y,
                  {
                    className: "border-green-500/50 bg-green-500/5",
                    children: [
                      e.jsxDEV(
                        C,
                        {
                          className: "text-center",
                          children: [
                            e.jsxDEV(
                              _,
                              {
                                className:
                                  "h-16 w-16 text-green-500 mx-auto mb-4",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 316,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              S,
                              {
                                className: "text-2xl",
                                children: "Identity Verified",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 317,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              q,
                              {
                                children:
                                  "Your identity has been verified. You can now receive payouts and access all platform features.",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 318,
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
                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                          lineNumber: 315,
                          columnNumber: 13,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        I,
                        {
                          className: "flex justify-center",
                          children: e.jsxDEV(
                            D,
                            {
                              onClick: () => P("/dashboard"),
                              children: "Return to Dashboard",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 323,
                              columnNumber: 15,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                          lineNumber: 322,
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
                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                    lineNumber: 314,
                    columnNumber: 11,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                lineNumber: 313,
                columnNumber: 9,
              },
              this,
            )
          : r?.status === "under_review"
            ? e.jsxDEV(
                "div",
                {
                  className: "max-w-2xl mx-auto space-y-6",
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className: "flex items-center justify-between",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              children: e.jsxDEV(
                                "h1",
                                {
                                  className:
                                    "text-3xl font-bold flex items-center gap-3",
                                  children: [
                                    e.jsxDEV(
                                      re,
                                      { className: "h-8 w-8 text-primary" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                                        lineNumber: 336,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    "Identity Verification",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                  lineNumber: 335,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 334,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          R(),
                        ],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 333,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      y,
                      {
                        className: "border-blue-500/50 bg-blue-500/5",
                        children: [
                          e.jsxDEV(
                            C,
                            {
                              className: "text-center",
                              children: [
                                e.jsxDEV(
                                  d,
                                  {
                                    className:
                                      "h-16 w-16 text-blue-500 mx-auto mb-4",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 345,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  S,
                                  {
                                    className: "text-2xl",
                                    children: "Under Review",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 346,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  q,
                                  {
                                    className: "text-base",
                                    children:
                                      r.message ||
                                      "Your verification is being reviewed.",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
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
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 344,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            I,
                            {
                              className: "space-y-6",
                              children: [
                                e.jsxDEV(
                                  Y,
                                  { value: 90, className: "h-3" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 352,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "grid grid-cols-2 gap-4 text-center",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "p-4 bg-muted/50 rounded-lg",
                                          children: [
                                            e.jsxDEV(
                                              $,
                                              {
                                                className:
                                                  "h-6 w-6 mx-auto mb-2 text-muted-foreground",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 356,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-sm font-medium",
                                                children:
                                                  "Estimated Review Time",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 357,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-lg font-bold text-primary",
                                                children:
                                                  r.estimatedReviewTime ||
                                                  "1-2 business days",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 358,
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
                                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                                          lineNumber: 355,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "p-4 bg-muted/50 rounded-lg",
                                          children: [
                                            e.jsxDEV(
                                              d,
                                              {
                                                className:
                                                  "h-6 w-6 mx-auto mb-2 text-muted-foreground",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 361,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-sm font-medium",
                                                children: "Documents Submitted",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 362,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-lg font-bold text-primary",
                                                children: [
                                                  r.documentsSubmitted
                                                    ?.length || 0,
                                                  " of ",
                                                  r.documentsRequired?.length ||
                                                    0,
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 363,
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
                                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                                          lineNumber: 360,
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
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 354,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                r.submittedAt &&
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className:
                                        "text-sm text-center text-muted-foreground",
                                      children: [
                                        "Submitted on ",
                                        new Date(
                                          r.submittedAt,
                                        ).toLocaleDateString("en-US", {
                                          weekday: "long",
                                          year: "numeric",
                                          month: "long",
                                          day: "numeric",
                                        }),
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 368,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                e.jsxDEV(
                                  "p",
                                  {
                                    className:
                                      "text-sm text-center text-muted-foreground",
                                    children:
                                      "We'll notify you by email once the review is complete.",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 378,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex justify-center gap-3",
                                    children: e.jsxDEV(
                                      D,
                                      {
                                        variant: "outline",
                                        onClick: () => P("/dashboard"),
                                        children: "Return to Dashboard",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                                        lineNumber: 383,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 382,
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
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 351,
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
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 343,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    r.supportContact &&
                      e.jsxDEV(
                        Ee,
                        { contact: r.supportContact },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                          lineNumber: 390,
                          columnNumber: 37,
                        },
                        this,
                      ),
                    e.jsxDEV(
                      oe,
                      {},
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 391,
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
                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                  lineNumber: 332,
                  columnNumber: 9,
                },
                this,
              )
            : e.jsxDEV(
                "div",
                {
                  className: "max-w-4xl mx-auto space-y-6",
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
                                  "h1",
                                  {
                                    className:
                                      "text-3xl font-bold flex items-center gap-3",
                                    children: [
                                      e.jsxDEV(
                                        re,
                                        { className: "h-8 w-8 text-primary" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                                          lineNumber: 401,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      "Identity Verification",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 400,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "p",
                                  {
                                    className: "text-muted-foreground mt-1",
                                    children:
                                      "Verify your identity to enable payouts and advanced features",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 404,
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
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 399,
                              columnNumber: 11,
                            },
                            this,
                          ),
                          R(),
                        ],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 398,
                        columnNumber: 9,
                      },
                      this,
                    ),
                    r?.status === "rejected" &&
                      e.jsxDEV(
                        y,
                        {
                          className: "border-destructive bg-destructive/10",
                          children: [
                            e.jsxDEV(
                              C,
                              {
                                children: e.jsxDEV(
                                  S,
                                  {
                                    className:
                                      "text-destructive flex items-center gap-2",
                                    children: [
                                      e.jsxDEV(
                                        Q,
                                        { className: "h-5 w-5" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                                          lineNumber: 415,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      "Verification Rejected",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 414,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 413,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              I,
                              {
                                className: "space-y-4",
                                children: [
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className:
                                        "p-3 bg-destructive/10 rounded-lg",
                                      children: [
                                        e.jsxDEV(
                                          "p",
                                          {
                                            className: "font-medium",
                                            children: "Reason:",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                            lineNumber: 421,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "p",
                                          {
                                            className:
                                              "text-sm text-muted-foreground",
                                            children:
                                              r.rejectionReason ||
                                              r.message ||
                                              "No specific reason provided",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                            lineNumber: 422,
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
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 420,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  r.documentsRejected &&
                                    r.documentsRejected.length > 0 &&
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "space-y-2",
                                        children: [
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className: "font-medium text-sm",
                                              children:
                                                "Documents requiring resubmission:",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                                              lineNumber: 427,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "ul",
                                            {
                                              className:
                                                "text-sm text-muted-foreground space-y-1",
                                              children: r.documentChecklist
                                                ?.filter(
                                                  (i) =>
                                                    i.status === "rejected",
                                                )
                                                .map((i) =>
                                                  e.jsxDEV(
                                                    "li",
                                                    {
                                                      className:
                                                        "flex items-start gap-2",
                                                      children: [
                                                        e.jsxDEV(
                                                          se,
                                                          {
                                                            className:
                                                              "h-4 w-4 mt-0.5 text-destructive flex-shrink-0",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 431,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            children: [
                                                              e.jsxDEV(
                                                                "strong",
                                                                {
                                                                  children: [
                                                                    i.name,
                                                                    ":",
                                                                  ],
                                                                },
                                                                void 0,
                                                                !0,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 432,
                                                                  columnNumber: 31,
                                                                },
                                                                this,
                                                              ),
                                                              " ",
                                                              i.rejectionReason ||
                                                                "Needs resubmission",
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 432,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                      ],
                                                    },
                                                    i.type,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 430,
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
                                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                                              lineNumber: 428,
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
                                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                                        lineNumber: 426,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                  r.nextSteps &&
                                    r.nextSteps.length > 0 &&
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "space-y-2",
                                        children: [
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "font-medium text-sm flex items-center gap-2",
                                              children: [
                                                e.jsxDEV(
                                                  te,
                                                  { className: "h-4 w-4" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                    lineNumber: 442,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                "What to do next:",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                                              lineNumber: 441,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "ul",
                                            {
                                              className:
                                                "text-sm text-muted-foreground space-y-1 ml-6",
                                              children: r.nextSteps.map(
                                                (i, s) =>
                                                  e.jsxDEV(
                                                    "li",
                                                    { children: i },
                                                    s,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 447,
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
                                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                                              lineNumber: 445,
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
                                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                                        lineNumber: 440,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className: "flex gap-3 mt-4",
                                      children: [
                                        e.jsxDEV(
                                          D,
                                          {
                                            onClick: () => {
                                              (l(1), F.mutate(g));
                                            },
                                            children: [
                                              e.jsxDEV(
                                                se,
                                                { className: "h-4 w-4 mr-2" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                  lineNumber: 458,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              "Start New Verification",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                            lineNumber: 454,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        r.supportContact &&
                                          e.jsxDEV(
                                            D,
                                            {
                                              variant: "outline",
                                              onClick: () =>
                                                window.open(
                                                  `mailto:${r.supportContact?.email}`,
                                                ),
                                              children: [
                                                e.jsxDEV(
                                                  me,
                                                  { className: "h-4 w-4 mr-2" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                    lineNumber: 463,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                "Contact Support",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                                              lineNumber: 462,
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
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 453,
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
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 419,
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
                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                          lineNumber: 412,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    j &&
                      r?.status !== "rejected" &&
                      e.jsxDEV(
                        y,
                        {
                          children: [
                            e.jsxDEV(
                              C,
                              {
                                children: e.jsxDEV(
                                  S,
                                  { children: "Verification Progress" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 475,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 474,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              I,
                              {
                                className: "space-y-4",
                                children: [
                                  e.jsxDEV(
                                    ye,
                                    { currentStep: w, status: r },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 478,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    Y,
                                    { value: x(), className: "h-3" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 479,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className:
                                        "flex justify-between text-sm text-muted-foreground mt-2",
                                      children: [
                                        e.jsxDEV(
                                          "span",
                                          { children: ["Step ", w, " of 4"] },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                            lineNumber: 481,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "span",
                                          { children: [x(), "% complete"] },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                            lineNumber: 482,
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
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 480,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  r?.nextSteps &&
                                    r.nextSteps.length > 0 &&
                                    r.status === "pending" &&
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "mt-4 p-3 bg-muted/50 rounded-lg",
                                        children: [
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-sm font-medium flex items-center gap-2 mb-2",
                                              children: [
                                                e.jsxDEV(
                                                  te,
                                                  { className: "h-4 w-4" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                    lineNumber: 487,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                "Next Steps:",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                                              lineNumber: 486,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "ul",
                                            {
                                              className:
                                                "text-sm text-muted-foreground space-y-1 ml-6 list-disc",
                                              children: r.nextSteps.map(
                                                (i, s) =>
                                                  e.jsxDEV(
                                                    "li",
                                                    { children: i },
                                                    s,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 492,
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
                                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                                              lineNumber: 490,
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
                                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                                        lineNumber: 485,
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
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 477,
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
                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                          lineNumber: 473,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    (r?.status === "not_started" || !j) &&
                      w === 1 &&
                      e.jsxDEV(
                        y,
                        {
                          children: [
                            e.jsxDEV(
                              C,
                              {
                                children: [
                                  e.jsxDEV(
                                    S,
                                    { children: "Choose Verification Type" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 504,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    q,
                                    {
                                      children:
                                        "Select whether you're verifying as an individual artist or a business entity",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 505,
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
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 503,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              I,
                              {
                                className: "space-y-6",
                                children: [
                                  e.jsxDEV(
                                    we,
                                    {
                                      value: g,
                                      onValueChange: (i) => U(i),
                                      children: [
                                        e.jsxDEV(
                                          ke,
                                          {
                                            className:
                                              "grid w-full grid-cols-2",
                                            children: [
                                              e.jsxDEV(
                                                ce,
                                                {
                                                  value: "individual",
                                                  className:
                                                    "flex items-center gap-2",
                                                  children: [
                                                    e.jsxDEV(
                                                      ue,
                                                      { className: "h-4 w-4" },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                        lineNumber: 513,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    "Individual",
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                  lineNumber: 512,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                ce,
                                                {
                                                  value: "business",
                                                  className:
                                                    "flex items-center gap-2",
                                                  children: [
                                                    e.jsxDEV(
                                                      pe,
                                                      { className: "h-4 w-4" },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                        lineNumber: 517,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    "Business",
                                                  ],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                  lineNumber: 516,
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
                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                            lineNumber: 511,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          le,
                                          {
                                            value: "individual",
                                            className: "mt-4",
                                            children: e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "bg-muted/50 rounded-lg p-4 space-y-2",
                                                children: [
                                                  e.jsxDEV(
                                                    "h4",
                                                    {
                                                      className: "font-medium",
                                                      children:
                                                        "Individual Verification",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 523,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "ul",
                                                    {
                                                      className:
                                                        "text-sm text-muted-foreground space-y-1",
                                                      children: [
                                                        e.jsxDEV(
                                                          "li",
                                                          {
                                                            className:
                                                              "flex items-center gap-2",
                                                            children: [
                                                              e.jsxDEV(
                                                                d,
                                                                {
                                                                  className:
                                                                    "h-3 w-3",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 525,
                                                                  columnNumber: 63,
                                                                },
                                                                this,
                                                              ),
                                                              " Government-issued photo ID (passport, driver's license)",
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 525,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "li",
                                                          {
                                                            className:
                                                              "flex items-center gap-2",
                                                            children: [
                                                              e.jsxDEV(
                                                                d,
                                                                {
                                                                  className:
                                                                    "h-3 w-3",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 526,
                                                                  columnNumber: 63,
                                                                },
                                                                this,
                                                              ),
                                                              " Proof of address (utility bill, bank statement)",
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 526,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "li",
                                                          {
                                                            className:
                                                              "flex items-center gap-2",
                                                            children: [
                                                              e.jsxDEV(
                                                                d,
                                                                {
                                                                  className:
                                                                    "h-3 w-3",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 527,
                                                                  columnNumber: 63,
                                                                },
                                                                this,
                                                              ),
                                                              " Selfie for facial verification",
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 527,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "li",
                                                          {
                                                            className:
                                                              "flex items-center gap-2",
                                                            children: [
                                                              e.jsxDEV(
                                                                d,
                                                                {
                                                                  className:
                                                                    "h-3 w-3",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 528,
                                                                  columnNumber: 63,
                                                                },
                                                                this,
                                                              ),
                                                              " Tax information (W-9 for US residents)",
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 528,
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
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 524,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 522,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                            lineNumber: 521,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          le,
                                          {
                                            value: "business",
                                            className: "mt-4",
                                            children: e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "bg-muted/50 rounded-lg p-4 space-y-2",
                                                children: [
                                                  e.jsxDEV(
                                                    "h4",
                                                    {
                                                      className: "font-medium",
                                                      children:
                                                        "Business Verification",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 534,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "ul",
                                                    {
                                                      className:
                                                        "text-sm text-muted-foreground space-y-1",
                                                      children: [
                                                        e.jsxDEV(
                                                          "li",
                                                          {
                                                            className:
                                                              "flex items-center gap-2",
                                                            children: [
                                                              e.jsxDEV(
                                                                d,
                                                                {
                                                                  className:
                                                                    "h-3 w-3",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 536,
                                                                  columnNumber: 63,
                                                                },
                                                                this,
                                                              ),
                                                              " Business registration documents",
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 536,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "li",
                                                          {
                                                            className:
                                                              "flex items-center gap-2",
                                                            children: [
                                                              e.jsxDEV(
                                                                d,
                                                                {
                                                                  className:
                                                                    "h-3 w-3",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 537,
                                                                  columnNumber: 63,
                                                                },
                                                                this,
                                                              ),
                                                              " Articles of incorporation",
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 537,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "li",
                                                          {
                                                            className:
                                                              "flex items-center gap-2",
                                                            children: [
                                                              e.jsxDEV(
                                                                d,
                                                                {
                                                                  className:
                                                                    "h-3 w-3",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 538,
                                                                  columnNumber: 63,
                                                                },
                                                                this,
                                                              ),
                                                              " Tax ID documentation (EIN)",
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 538,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "li",
                                                          {
                                                            className:
                                                              "flex items-center gap-2",
                                                            children: [
                                                              e.jsxDEV(
                                                                d,
                                                                {
                                                                  className:
                                                                    "h-3 w-3",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 539,
                                                                  columnNumber: 63,
                                                                },
                                                                this,
                                                              ),
                                                              " Proof of business address",
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 539,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "li",
                                                          {
                                                            className:
                                                              "flex items-center gap-2",
                                                            children: [
                                                              e.jsxDEV(
                                                                d,
                                                                {
                                                                  className:
                                                                    "h-3 w-3",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 540,
                                                                  columnNumber: 63,
                                                                },
                                                                this,
                                                              ),
                                                              " Authorized representative ID",
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
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
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 535,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 533,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
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
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 510,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    D,
                                    {
                                      className: "w-full",
                                      onClick: () => F.mutate(g),
                                      disabled: F.isPending,
                                      children: F.isPending
                                        ? e.jsxDEV(
                                            e.Fragment,
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  O,
                                                  {
                                                    className:
                                                      "h-4 w-4 mr-2 animate-spin",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                    lineNumber: 553,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                "Starting...",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                                              lineNumber: 552,
                                              columnNumber: 19,
                                            },
                                            this,
                                          )
                                        : "Start Verification",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 546,
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
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 509,
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
                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                          lineNumber: 502,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    w === 2 &&
                      j &&
                      e.jsxDEV(
                        y,
                        {
                          children: [
                            e.jsxDEV(
                              C,
                              {
                                children: [
                                  e.jsxDEV(
                                    S,
                                    {
                                      children:
                                        g === "individual"
                                          ? "Personal Information"
                                          : "Business Information",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 567,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    q,
                                    {
                                      children:
                                        "Please provide accurate information matching your official documents",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 570,
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
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 566,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              I,
                              {
                                children: [
                                  g === "individual"
                                    ? e.jsxDEV(
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
                                                    o,
                                                    {
                                                      htmlFor: "firstName",
                                                      children: "First Name *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 578,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "firstName",
                                                      value: a.firstName,
                                                      onChange: (i) =>
                                                        p({
                                                          ...a,
                                                          firstName:
                                                            i.target.value,
                                                        }),
                                                      placeholder: "John",
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 579,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 577,
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
                                                    o,
                                                    {
                                                      htmlFor: "lastName",
                                                      children: "Last Name *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 588,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "lastName",
                                                      value: a.lastName,
                                                      onChange: (i) =>
                                                        p({
                                                          ...a,
                                                          lastName:
                                                            i.target.value,
                                                        }),
                                                      placeholder: "Doe",
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 589,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 587,
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
                                                    o,
                                                    {
                                                      htmlFor: "dob",
                                                      children:
                                                        "Date of Birth *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 598,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "dob",
                                                      type: "date",
                                                      value: a.dateOfBirth,
                                                      onChange: (i) =>
                                                        p({
                                                          ...a,
                                                          dateOfBirth:
                                                            i.target.value,
                                                        }),
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 599,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 597,
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
                                                    o,
                                                    {
                                                      htmlFor: "nationality",
                                                      children: "Nationality *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 608,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "nationality",
                                                      value: a.nationality,
                                                      onChange: (i) =>
                                                        p({
                                                          ...a,
                                                          nationality:
                                                            i.target.value,
                                                        }),
                                                      placeholder:
                                                        "United States",
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 609,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 607,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "space-y-2 col-span-2",
                                                children: [
                                                  e.jsxDEV(
                                                    o,
                                                    {
                                                      htmlFor: "address",
                                                      children:
                                                        "Street Address *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 618,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "address",
                                                      value: a.address,
                                                      onChange: (i) =>
                                                        p({
                                                          ...a,
                                                          address:
                                                            i.target.value,
                                                        }),
                                                      placeholder:
                                                        "123 Main St",
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 619,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 617,
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
                                                    o,
                                                    {
                                                      htmlFor: "city",
                                                      children: "City *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 628,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "city",
                                                      value: a.city,
                                                      onChange: (i) =>
                                                        p({
                                                          ...a,
                                                          city: i.target.value,
                                                        }),
                                                      placeholder:
                                                        "Los Angeles",
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 629,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 627,
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
                                                    o,
                                                    {
                                                      htmlFor: "state",
                                                      children:
                                                        "State/Province *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 638,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "state",
                                                      value: a.state,
                                                      onChange: (i) =>
                                                        p({
                                                          ...a,
                                                          state: i.target.value,
                                                        }),
                                                      placeholder: "California",
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 639,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 637,
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
                                                    o,
                                                    {
                                                      htmlFor: "postalCode",
                                                      children: "Postal Code *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 648,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "postalCode",
                                                      value: a.postalCode,
                                                      onChange: (i) =>
                                                        p({
                                                          ...a,
                                                          postalCode:
                                                            i.target.value,
                                                        }),
                                                      placeholder: "90001",
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 649,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 647,
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
                                                    o,
                                                    {
                                                      htmlFor: "country",
                                                      children: "Country *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 658,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    H,
                                                    {
                                                      value: a.country,
                                                      onValueChange: (i) =>
                                                        p({ ...a, country: i }),
                                                      children: [
                                                        e.jsxDEV(
                                                          Z,
                                                          {
                                                            children: e.jsxDEV(
                                                              ee,
                                                              {},
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                lineNumber: 664,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 663,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          ie,
                                                          {
                                                            children: [
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: "US",
                                                                  children:
                                                                    "United States",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 667,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: "CA",
                                                                  children:
                                                                    "Canada",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 668,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: "GB",
                                                                  children:
                                                                    "United Kingdom",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 669,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: "DE",
                                                                  children:
                                                                    "Germany",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 670,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: "FR",
                                                                  children:
                                                                    "France",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 671,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: "AU",
                                                                  children:
                                                                    "Australia",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 672,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: "JP",
                                                                  children:
                                                                    "Japan",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 673,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: "BR",
                                                                  children:
                                                                    "Brazil",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 674,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: "MX",
                                                                  children:
                                                                    "Mexico",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 675,
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
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 666,
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
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 659,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 657,
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
                                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                                          lineNumber: 576,
                                          columnNumber: 17,
                                        },
                                        this,
                                      )
                                    : e.jsxDEV(
                                        "div",
                                        {
                                          className: "grid grid-cols-2 gap-4",
                                          children: [
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "space-y-2 col-span-2",
                                                children: [
                                                  e.jsxDEV(
                                                    o,
                                                    {
                                                      htmlFor: "businessName",
                                                      children:
                                                        "Business Name *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 683,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "businessName",
                                                      value: n.businessName,
                                                      onChange: (i) =>
                                                        v({
                                                          ...n,
                                                          businessName:
                                                            i.target.value,
                                                        }),
                                                      placeholder:
                                                        "Acme Records LLC",
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 684,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 682,
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
                                                    o,
                                                    {
                                                      htmlFor: "businessType",
                                                      children:
                                                        "Business Type *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 693,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    H,
                                                    {
                                                      value: n.businessType,
                                                      onValueChange: (i) =>
                                                        v({
                                                          ...n,
                                                          businessType: i,
                                                        }),
                                                      children: [
                                                        e.jsxDEV(
                                                          Z,
                                                          {
                                                            children: e.jsxDEV(
                                                              ee,
                                                              {
                                                                placeholder:
                                                                  "Select type",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                lineNumber: 699,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 698,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          ie,
                                                          {
                                                            children: [
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: "llc",
                                                                  children:
                                                                    "LLC",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 702,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value:
                                                                    "corporation",
                                                                  children:
                                                                    "Corporation",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 703,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value:
                                                                    "partnership",
                                                                  children:
                                                                    "Partnership",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 704,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value:
                                                                    "sole_proprietorship",
                                                                  children:
                                                                    "Sole Proprietorship",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 705,
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
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 701,
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
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 694,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 692,
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
                                                    o,
                                                    {
                                                      htmlFor: "regNumber",
                                                      children:
                                                        "Registration Number *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 710,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "regNumber",
                                                      value:
                                                        n.businessRegistrationNumber,
                                                      onChange: (i) =>
                                                        v({
                                                          ...n,
                                                          businessRegistrationNumber:
                                                            i.target.value,
                                                        }),
                                                      placeholder: "12-3456789",
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 711,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 709,
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
                                                    o,
                                                    {
                                                      htmlFor: "taxId",
                                                      children:
                                                        "Tax ID (EIN) *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 720,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "taxId",
                                                      value: n.taxIdNumber,
                                                      onChange: (i) =>
                                                        v({
                                                          ...n,
                                                          taxIdNumber:
                                                            i.target.value,
                                                        }),
                                                      placeholder: "XX-XXXXXXX",
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 721,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 719,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "space-y-2 col-span-2",
                                                children: [
                                                  e.jsxDEV(
                                                    o,
                                                    {
                                                      htmlFor: "bizAddress",
                                                      children:
                                                        "Business Address *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 730,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "bizAddress",
                                                      value: n.address,
                                                      onChange: (i) =>
                                                        v({
                                                          ...n,
                                                          address:
                                                            i.target.value,
                                                        }),
                                                      placeholder:
                                                        "456 Business Ave",
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 731,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 729,
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
                                                    o,
                                                    {
                                                      htmlFor: "bizCity",
                                                      children: "City *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 740,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "bizCity",
                                                      value: n.city,
                                                      onChange: (i) =>
                                                        v({
                                                          ...n,
                                                          city: i.target.value,
                                                        }),
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 741,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 739,
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
                                                    o,
                                                    {
                                                      htmlFor: "bizState",
                                                      children: "State *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 749,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "bizState",
                                                      value: n.state,
                                                      onChange: (i) =>
                                                        v({
                                                          ...n,
                                                          state: i.target.value,
                                                        }),
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 750,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 748,
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
                                                    o,
                                                    {
                                                      htmlFor: "bizPostal",
                                                      children: "Postal Code *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 758,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    f,
                                                    {
                                                      id: "bizPostal",
                                                      value: n.postalCode,
                                                      onChange: (i) =>
                                                        v({
                                                          ...n,
                                                          postalCode:
                                                            i.target.value,
                                                        }),
                                                      required: !0,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
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
                                                    o,
                                                    {
                                                      htmlFor: "bizCountry",
                                                      children: "Country *",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 767,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    H,
                                                    {
                                                      value: n.country,
                                                      onValueChange: (i) =>
                                                        v({ ...n, country: i }),
                                                      children: [
                                                        e.jsxDEV(
                                                          Z,
                                                          {
                                                            children: e.jsxDEV(
                                                              ee,
                                                              {},
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                lineNumber: 773,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            ),
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 772,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          ie,
                                                          {
                                                            children: [
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: "US",
                                                                  children:
                                                                    "United States",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 776,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: "CA",
                                                                  children:
                                                                    "Canada",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 777,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                u,
                                                                {
                                                                  value: "GB",
                                                                  children:
                                                                    "United Kingdom",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                                  lineNumber: 778,
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
                                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                            lineNumber: 775,
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
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 768,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 766,
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
                                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                                          lineNumber: 681,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className: "flex gap-3 mt-6",
                                      children: [
                                        e.jsxDEV(
                                          D,
                                          {
                                            variant: "outline",
                                            onClick: () => l(1),
                                            children: "Back",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                            lineNumber: 786,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          D,
                                          {
                                            className: "flex-1",
                                            onClick: () => A.mutate(),
                                            disabled: A.isPending,
                                            children: A.isPending
                                              ? e.jsxDEV(
                                                  e.Fragment,
                                                  {
                                                    children: [
                                                      e.jsxDEV(
                                                        O,
                                                        {
                                                          className:
                                                            "h-4 w-4 mr-2 animate-spin",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                          lineNumber: 794,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      "Saving...",
                                                    ],
                                                  },
                                                  void 0,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                    lineNumber: 793,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                )
                                              : "Save & Continue",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
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
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 785,
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
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 574,
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
                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                          lineNumber: 565,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    w === 3 &&
                      j &&
                      e.jsxDEV(
                        y,
                        {
                          children: [
                            e.jsxDEV(
                              C,
                              {
                                children: [
                                  e.jsxDEV(
                                    S,
                                    {
                                      className: "flex items-center gap-2",
                                      children: [
                                        e.jsxDEV(
                                          ne,
                                          { className: "h-5 w-5" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                            lineNumber: 810,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        "Document Upload",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 809,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    q,
                                    {
                                      children:
                                        "Upload clear photos or scans of your documents. Accepted formats: JPG, PNG, PDF (max 10MB each)",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 813,
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
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 808,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              I,
                              {
                                className: "space-y-4",
                                children: [
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className: "grid gap-4",
                                      children:
                                        g === "individual"
                                          ? e.jsxDEV(
                                              e.Fragment,
                                              {
                                                children: [
                                                  e.jsxDEV(
                                                    L,
                                                    {
                                                      title: "Government ID",
                                                      description:
                                                        "Passport, driver's license, or national ID",
                                                      type: "government_id",
                                                      verificationId: j,
                                                      existingDoc:
                                                        T?.documents?.find(
                                                          (i) =>
                                                            i.documentType ===
                                                            "government_id",
                                                        ),
                                                      onUploadComplete: (i) =>
                                                        k((s) => ({
                                                          ...s,
                                                          government_id: i,
                                                        })),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 821,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    L,
                                                    {
                                                      title: "Proof of Address",
                                                      description:
                                                        "Utility bill or bank statement (last 3 months)",
                                                      type: "proof_of_address",
                                                      verificationId: j,
                                                      existingDoc:
                                                        T?.documents?.find(
                                                          (i) =>
                                                            i.documentType ===
                                                            "proof_of_address",
                                                        ),
                                                      onUploadComplete: (i) =>
                                                        k((s) => ({
                                                          ...s,
                                                          proof_of_address: i,
                                                        })),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 829,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    L,
                                                    {
                                                      title:
                                                        "Selfie Verification",
                                                      description:
                                                        "Take a clear selfie holding your ID next to your face",
                                                      type: "selfie",
                                                      verificationId: j,
                                                      existingDoc:
                                                        T?.documents?.find(
                                                          (i) =>
                                                            i.documentType ===
                                                            "selfie",
                                                        ),
                                                      onUploadComplete: (i) =>
                                                        k((s) => ({
                                                          ...s,
                                                          selfie: i,
                                                        })),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 820,
                                                columnNumber: 19,
                                              },
                                              this,
                                            )
                                          : e.jsxDEV(
                                              e.Fragment,
                                              {
                                                children: [
                                                  e.jsxDEV(
                                                    L,
                                                    {
                                                      title:
                                                        "Business Registration",
                                                      description:
                                                        "Certificate of incorporation or registration",
                                                      type: "business_registration",
                                                      verificationId: j,
                                                      existingDoc:
                                                        T?.documents?.find(
                                                          (i) =>
                                                            i.documentType ===
                                                            "business_registration",
                                                        ),
                                                      onUploadComplete: (i) =>
                                                        k((s) => ({
                                                          ...s,
                                                          business_registration:
                                                            i,
                                                        })),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 848,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    L,
                                                    {
                                                      title: "Tax ID Document",
                                                      description:
                                                        "EIN letter or equivalent",
                                                      type: "tax_id_document",
                                                      verificationId: j,
                                                      existingDoc:
                                                        T?.documents?.find(
                                                          (i) =>
                                                            i.documentType ===
                                                            "tax_id_document",
                                                        ),
                                                      onUploadComplete: (i) =>
                                                        k((s) => ({
                                                          ...s,
                                                          tax_id_document: i,
                                                        })),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 856,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    L,
                                                    {
                                                      title: "Proof of Address",
                                                      description:
                                                        "Business utility bill or bank statement",
                                                      type: "proof_of_address",
                                                      verificationId: j,
                                                      existingDoc:
                                                        T?.documents?.find(
                                                          (i) =>
                                                            i.documentType ===
                                                            "proof_of_address",
                                                        ),
                                                      onUploadComplete: (i) =>
                                                        k((s) => ({
                                                          ...s,
                                                          proof_of_address: i,
                                                        })),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                      lineNumber: 864,
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
                                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                lineNumber: 847,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 818,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className: "flex gap-3 mt-6",
                                      children: [
                                        e.jsxDEV(
                                          D,
                                          {
                                            variant: "outline",
                                            onClick: () => l(2),
                                            children: "Back",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                            lineNumber: 877,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          D,
                                          {
                                            className: "flex-1",
                                            onClick: () => z.mutate(),
                                            disabled:
                                              z.isPending ||
                                              Object.keys(M).length === 0,
                                            children: z.isPending
                                              ? e.jsxDEV(
                                                  e.Fragment,
                                                  {
                                                    children: [
                                                      e.jsxDEV(
                                                        O,
                                                        {
                                                          className:
                                                            "h-4 w-4 mr-2 animate-spin",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                          lineNumber: 885,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      "Submitting...",
                                                    ],
                                                  },
                                                  void 0,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                                    lineNumber: 884,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                )
                                              : "Submit for Review",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                                            lineNumber: 878,
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
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 876,
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
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 817,
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
                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                          lineNumber: 807,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    w === 4 &&
                      e.jsxDEV(
                        y,
                        {
                          className: "border-blue-500/50 bg-blue-500/5",
                          children: [
                            e.jsxDEV(
                              C,
                              {
                                className: "text-center",
                                children: [
                                  e.jsxDEV(
                                    d,
                                    {
                                      className:
                                        "h-16 w-16 text-blue-500 mx-auto mb-4",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 900,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    S,
                                    {
                                      className: "text-2xl",
                                      children: "Verification Submitted",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 901,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    q,
                                    {
                                      className: "text-base",
                                      children:
                                        "Your verification is being reviewed. This typically takes 1-2 business days.",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 902,
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
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 899,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              I,
                              {
                                className: "space-y-4",
                                children: [
                                  e.jsxDEV(
                                    Y,
                                    { value: 90, className: "h-3" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 907,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "p",
                                    {
                                      className:
                                        "text-sm text-center text-muted-foreground",
                                      children:
                                        "We'll notify you by email once the review is complete.",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 908,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className: "flex justify-center",
                                      children: e.jsxDEV(
                                        D,
                                        {
                                          onClick: () => P("/dashboard"),
                                          children: "Return to Dashboard",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                                          lineNumber: 912,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 911,
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
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 906,
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
                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                          lineNumber: 898,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    e.jsxDEV(
                      oe,
                      {},
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 920,
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
                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                  lineNumber: 397,
                  columnNumber: 7,
                },
                this,
              );
  return e.jsxDEV(
    De,
    { children: X() },
    void 0,
    !1,
    {
      fileName: "/home/runner/workspace/client/src/pages/Verification.tsx",
      lineNumber: 926,
      columnNumber: 5,
    },
    this,
  );
}
function oe() {
  return e.jsxDEV(
    y,
    {
      className: "bg-muted/30",
      children: [
        e.jsxDEV(
          C,
          {
            children: e.jsxDEV(
              S,
              {
                className: "flex items-center gap-2 text-lg",
                children: [
                  e.jsxDEV(
                    Ve,
                    { className: "h-5 w-5" },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                      lineNumber: 937,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  "Why Verify?",
                ],
              },
              void 0,
              !0,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                lineNumber: 936,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/pages/Verification.tsx",
            lineNumber: 935,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          I,
          {
            children: e.jsxDEV(
              "ul",
              {
                className: "space-y-2 text-sm text-muted-foreground",
                children: [
                  e.jsxDEV(
                    "li",
                    {
                      className: "flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          _,
                          { className: "h-4 w-4 text-green-500" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                            lineNumber: 944,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        "Enable instant payouts to your bank account",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                      lineNumber: 943,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "li",
                    {
                      className: "flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          _,
                          { className: "h-4 w-4 text-green-500" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                            lineNumber: 948,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        "Access higher payout limits",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                      lineNumber: 947,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "li",
                    {
                      className: "flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          _,
                          { className: "h-4 w-4 text-green-500" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                            lineNumber: 952,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        "Comply with financial regulations",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                      lineNumber: 951,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "li",
                    {
                      className: "flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          _,
                          { className: "h-4 w-4 text-green-500" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                            lineNumber: 956,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        "Build trust with collaborators and buyers",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                      lineNumber: 955,
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
                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                lineNumber: 942,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/pages/Verification.tsx",
            lineNumber: 941,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    !0,
    {
      fileName: "/home/runner/workspace/client/src/pages/Verification.tsx",
      lineNumber: 934,
      columnNumber: 5,
    },
    this,
  );
}
function Ee({ contact: t }) {
  return e.jsxDEV(
    y,
    {
      className: "bg-muted/30",
      children: [
        e.jsxDEV(
          C,
          {
            children: [
              e.jsxDEV(
                S,
                {
                  className: "flex items-center gap-2 text-lg",
                  children: [
                    e.jsxDEV(
                      xe,
                      { className: "h-5 w-5" },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 970,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    "Need Help?",
                  ],
                },
                void 0,
                !0,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                  lineNumber: 969,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                q,
                {
                  children:
                    "Our verification support team is here to assist you",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                  lineNumber: 973,
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
              "/home/runner/workspace/client/src/pages/Verification.tsx",
            lineNumber: 968,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          I,
          {
            className: "space-y-4",
            children: [
              e.jsxDEV(
                "div",
                {
                  className: "grid gap-3",
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className:
                          "flex items-center gap-3 p-3 bg-background rounded-lg",
                        children: [
                          e.jsxDEV(
                            me,
                            { className: "h-5 w-5 text-primary" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 980,
                              columnNumber: 13,
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
                                    className: "text-sm font-medium",
                                    children: "Email Support",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 982,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "a",
                                  {
                                    href: `mailto:${t.email}`,
                                    className:
                                      "text-sm text-primary hover:underline",
                                    children: t.email,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 983,
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
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 981,
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
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 979,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    t.phone &&
                      e.jsxDEV(
                        "div",
                        {
                          className:
                            "flex items-center gap-3 p-3 bg-background rounded-lg",
                          children: [
                            e.jsxDEV(
                              be,
                              { className: "h-5 w-5 text-primary" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 990,
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
                                      className: "text-sm font-medium",
                                      children: "Phone Support",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 992,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "a",
                                    {
                                      href: `tel:${t.phone}`,
                                      className:
                                        "text-sm text-primary hover:underline",
                                      children: t.phone,
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Verification.tsx",
                                      lineNumber: 993,
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
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 991,
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
                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                          lineNumber: 989,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    e.jsxDEV(
                      "div",
                      {
                        className:
                          "flex items-center gap-3 p-3 bg-background rounded-lg",
                        children: [
                          e.jsxDEV(
                            $,
                            { className: "h-5 w-5 text-muted-foreground" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 1e3,
                              columnNumber: 13,
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
                                    className: "text-sm font-medium",
                                    children: "Hours",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 1002,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "p",
                                  {
                                    className: "text-sm text-muted-foreground",
                                    children: t.hours,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 1003,
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
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 1001,
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
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 999,
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
                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                  lineNumber: 978,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                "p",
                {
                  className: "text-xs text-muted-foreground text-center",
                  children: ["Response time: ", t.responseTime],
                },
                void 0,
                !0,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                  lineNumber: 1007,
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
              "/home/runner/workspace/client/src/pages/Verification.tsx",
            lineNumber: 977,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    !0,
    {
      fileName: "/home/runner/workspace/client/src/pages/Verification.tsx",
      lineNumber: 967,
      columnNumber: 5,
    },
    this,
  );
}
function ye({ currentStep: t, status: P }) {
  const h = [
    { id: 1, label: "Choose Type", icon: ue },
    { id: 2, label: "Information", icon: d },
    { id: 3, label: "Documents", icon: ne },
    { id: 4, label: "Review", icon: re },
  ];
  return e.jsxDEV(
    "div",
    {
      className: "flex items-center justify-between mb-6",
      children: h.map((V, g) => {
        const U = V.icon,
          w = t > V.id || P?.status === "verified",
          l = t === V.id;
        return e.jsxDEV(
          "div",
          {
            className: "flex items-center",
            children: [
              e.jsxDEV(
                "div",
                {
                  className: `flex flex-col items-center ${g < h.length - 1 ? "flex-1" : ""}`,
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className: `
                w-10 h-10 rounded-full flex items-center justify-center transition-colors
                ${w ? "bg-green-500 text-white" : l ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}
              `,
                        children: w
                          ? e.jsxDEV(
                              _,
                              { className: "h-5 w-5" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 1039,
                                columnNumber: 32,
                              },
                              this,
                            )
                          : e.jsxDEV(
                              U,
                              { className: "h-5 w-5" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 1039,
                                columnNumber: 70,
                              },
                              this,
                            ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 1033,
                        columnNumber: 15,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "span",
                      {
                        className: `text-xs mt-1 ${l ? "font-medium" : "text-muted-foreground"}`,
                        children: V.label,
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 1041,
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
                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                  lineNumber: 1032,
                  columnNumber: 13,
                },
                this,
              ),
              g < h.length - 1 &&
                e.jsxDEV(
                  "div",
                  {
                    className: `h-0.5 flex-1 mx-2 ${t > V.id ? "bg-green-500" : "bg-muted"}`,
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                    lineNumber: 1046,
                    columnNumber: 15,
                  },
                  this,
                ),
            ],
          },
          V.id,
          !0,
          {
            fileName:
              "/home/runner/workspace/client/src/pages/Verification.tsx",
            lineNumber: 1031,
            columnNumber: 11,
          },
          this,
        );
      }),
    },
    void 0,
    !1,
    {
      fileName: "/home/runner/workspace/client/src/pages/Verification.tsx",
      lineNumber: 1024,
      columnNumber: 5,
    },
    this,
  );
}
function L({
  title: t,
  description: P,
  type: h,
  verificationId: V,
  existingDoc: g,
  onUploadComplete: U,
}) {
  const [w, l] = N.useState(!1),
    [c, J] = N.useState(g || null),
    [M, k] = N.useState(null),
    [a, p] = N.useState(null),
    [n, v] = N.useState(null),
    [r, B] = N.useState(!1),
    T = N.useRef(null),
    { toast: F } = de(),
    A = N.useCallback((R) => {
      if (R.type.startsWith("image/")) {
        const x = new FileReader();
        ((x.onload = (X) => v(X.target?.result)), x.readAsDataURL(R));
      } else R.type === "application/pdf" && v("pdf");
    }, []),
    z = N.useCallback(
      async (R) => {
        const x = R.target.files?.[0];
        if (!x) return;
        if ((k(null), p(null), x.size < 10 * 1024)) {
          (k(
            "File is too small (minimum 10KB). The document may not be readable.",
          ),
            p("Please upload a higher resolution document."));
          return;
        }
        if (x.size > 10 * 1024 * 1024) {
          (k("File is too large (maximum 10MB)."),
            p(
              "Try compressing the image or using a lower resolution scanner.",
            ));
          return;
        }
        if (
          !["image/jpeg", "image/png", "image/jpg", "application/pdf"].includes(
            x.type,
          )
        ) {
          (k(`Invalid file format (${x.type}).`),
            p(
              "Convert your document to JPG, PNG, or PDF format before uploading.",
            ));
          return;
        }
        (A(x), l(!0));
        try {
          const i = new FormData();
          (i.append("file", x),
            i.append("verificationId", V),
            i.append("documentType", h));
          const s = G(),
            m = await fetch("/api/kyc/documents/upload", {
              method: "POST",
              credentials: "include",
              headers: s ? { "x-csrf-token": s } : {},
              body: i,
            }),
            b = await m.json();
          if (!m.ok) throw new Error(b.error || "Failed to upload document");
          const E = {
            id: b.document.id,
            documentType: h,
            fileName: x.name,
            status: "pending",
          };
          (J(E),
            U(E),
            F({
              title: "Document uploaded",
              description: b.message || `${t} uploaded successfully.`,
            }));
        } catch (i) {
          const s =
            i instanceof Error ? i.message : "Failed to upload document";
          (k(s),
            v(null),
            F({
              title: "Upload failed",
              description: s,
              variant: "destructive",
            }));
        } finally {
          l(!1);
        }
      },
      [V, h, t, U, F, A],
    ),
    j = () => {
      if (!c) return null;
      switch (c.status) {
        case "approved":
          return e.jsxDEV(
            K,
            { className: "bg-green-500", children: "Approved" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/Verification.tsx",
              lineNumber: 1246,
              columnNumber: 16,
            },
            this,
          );
        case "rejected":
          return e.jsxDEV(
            K,
            { variant: "destructive", children: "Rejected" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/Verification.tsx",
              lineNumber: 1248,
              columnNumber: 16,
            },
            this,
          );
        default:
          return e.jsxDEV(
            K,
            { variant: "secondary", children: "Pending Review" },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/Verification.tsx",
              lineNumber: 1250,
              columnNumber: 16,
            },
            this,
          );
      }
    };
  return e.jsxDEV(
    "div",
    {
      className: `border rounded-lg p-4 transition-colors ${c?.status === "approved" ? "border-green-500 bg-green-500/5" : c?.status === "rejected" ? "border-destructive bg-destructive/5" : c ? "border-primary/50 bg-primary/5" : "border-dashed hover:border-primary/50"}`,
      children: [
        e.jsxDEV(
          "div",
          {
            className: "flex items-start justify-between gap-4",
            children: [
              n &&
                c &&
                e.jsxDEV(
                  "div",
                  {
                    className: "flex-shrink-0",
                    children:
                      n === "pdf"
                        ? e.jsxDEV(
                            "div",
                            {
                              className:
                                "w-16 h-16 bg-muted rounded flex items-center justify-center",
                              children: e.jsxDEV(
                                d,
                                { className: "h-8 w-8 text-muted-foreground" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
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
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 1264,
                              columnNumber: 15,
                            },
                            this,
                          )
                        : e.jsxDEV(
                            "div",
                            {
                              className:
                                "relative w-16 h-16 rounded overflow-hidden cursor-pointer border hover:border-primary",
                              onClick: () => B(!0),
                              children: [
                                e.jsxDEV(
                                  "img",
                                  {
                                    src: n,
                                    alt: "Preview",
                                    className: "w-full h-full object-cover",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 1272,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center",
                                    children: e.jsxDEV(
                                      ge,
                                      { className: "h-4 w-4 text-white" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                                        lineNumber: 1274,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 1273,
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
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 1268,
                              columnNumber: 15,
                            },
                            this,
                          ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                    lineNumber: 1262,
                    columnNumber: 11,
                  },
                  this,
                ),
              e.jsxDEV(
                "div",
                {
                  className: "flex-1 min-w-0",
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className: "flex items-center gap-2 flex-wrap",
                        children: [
                          e.jsxDEV(
                            "h4",
                            { className: "font-medium", children: t },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 1283,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          j(),
                        ],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 1282,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "p",
                      {
                        className: "text-sm text-muted-foreground",
                        children: P,
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 1286,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    c &&
                      e.jsxDEV(
                        "p",
                        {
                          className:
                            "text-xs text-muted-foreground mt-1 flex items-center gap-1 truncate",
                          children: [
                            e.jsxDEV(
                              d,
                              { className: "h-3 w-3 flex-shrink-0" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 1289,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "span",
                              { className: "truncate", children: c.fileName },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 1290,
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
                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                          lineNumber: 1288,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    c?.status === "rejected" &&
                      c.rejectionReason &&
                      e.jsxDEV(
                        "div",
                        {
                          className:
                            "mt-2 p-2 bg-destructive/10 rounded text-xs",
                          children: [
                            e.jsxDEV(
                              "p",
                              {
                                className: "text-destructive font-medium",
                                children: ["Rejected: ", c.rejectionReason],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 1295,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "p",
                              {
                                className: "text-muted-foreground mt-1",
                                children: "Please upload a new document.",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 1296,
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
                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                          lineNumber: 1294,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    M &&
                      e.jsxDEV(
                        "div",
                        {
                          className:
                            "mt-2 p-2 bg-destructive/10 rounded text-xs",
                          children: [
                            e.jsxDEV(
                              "p",
                              { className: "text-destructive", children: M },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 1301,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            a &&
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-muted-foreground mt-1",
                                  children: a,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                                  lineNumber: 1303,
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
                            "/home/runner/workspace/client/src/pages/Verification.tsx",
                          lineNumber: 1300,
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
                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                  lineNumber: 1281,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                "div",
                {
                  className: "flex items-center gap-2 flex-shrink-0",
                  children:
                    c?.status === "approved"
                      ? e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center gap-2",
                            children: e.jsxDEV(
                              _,
                              { className: "h-6 w-6 text-green-500" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Verification.tsx",
                                lineNumber: 1312,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                            lineNumber: 1311,
                            columnNumber: 13,
                          },
                          this,
                        )
                      : w
                        ? e.jsxDEV(
                            "div",
                            {
                              className: "flex flex-col items-center gap-1",
                              children: [
                                e.jsxDEV(
                                  O,
                                  {
                                    className:
                                      "h-6 w-6 animate-spin text-primary",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 1316,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "span",
                                  {
                                    className: "text-xs text-muted-foreground",
                                    children: "Uploading...",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Verification.tsx",
                                    lineNumber: 1317,
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
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 1315,
                              columnNumber: 13,
                            },
                            this,
                          )
                        : e.jsxDEV(
                            D,
                            {
                              variant: c ? "ghost" : "outline",
                              size: "sm",
                              onClick: () => T.current?.click(),
                              children:
                                c?.status === "rejected"
                                  ? e.jsxDEV(
                                      e.Fragment,
                                      {
                                        children: [
                                          e.jsxDEV(
                                            se,
                                            { className: "h-4 w-4 mr-2" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                                              lineNumber: 1327,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          "Re-upload",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                                        lineNumber: 1326,
                                        columnNumber: 17,
                                      },
                                      this,
                                    )
                                  : e.jsxDEV(
                                      e.Fragment,
                                      {
                                        children: [
                                          e.jsxDEV(
                                            ne,
                                            { className: "h-4 w-4 mr-2" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                                              lineNumber: 1332,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          c ? "Replace" : "Upload",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                                        lineNumber: 1331,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Verification.tsx",
                              lineNumber: 1320,
                              columnNumber: 13,
                            },
                            this,
                          ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                  lineNumber: 1309,
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
              "/home/runner/workspace/client/src/pages/Verification.tsx",
            lineNumber: 1260,
            columnNumber: 7,
          },
          this,
        ),
        r &&
          n &&
          n !== "pdf" &&
          e.jsxDEV(
            "div",
            {
              className:
                "fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4",
              onClick: () => B(!1),
              children: e.jsxDEV(
                "div",
                {
                  className: "relative max-w-4xl max-h-[90vh]",
                  children: [
                    e.jsxDEV(
                      "img",
                      {
                        src: n,
                        alt: "Document preview",
                        className: "max-w-full max-h-[90vh] rounded-lg",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 1347,
                        columnNumber: 13,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      D,
                      {
                        variant: "secondary",
                        size: "sm",
                        className: "absolute top-2 right-2",
                        onClick: () => B(!1),
                        children: e.jsxDEV(
                          ve,
                          { className: "h-4 w-4" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Verification.tsx",
                            lineNumber: 1354,
                            columnNumber: 15,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Verification.tsx",
                        lineNumber: 1348,
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
                    "/home/runner/workspace/client/src/pages/Verification.tsx",
                  lineNumber: 1346,
                  columnNumber: 11,
                },
                this,
              ),
            },
            void 0,
            !1,
            {
              fileName:
                "/home/runner/workspace/client/src/pages/Verification.tsx",
              lineNumber: 1342,
              columnNumber: 9,
            },
            this,
          ),
        e.jsxDEV(
          "input",
          {
            ref: T,
            type: "file",
            accept: ".jpg,.jpeg,.png,.pdf",
            className: "hidden",
            onChange: z,
          },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/pages/Verification.tsx",
            lineNumber: 1360,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    !0,
    {
      fileName: "/home/runner/workspace/client/src/pages/Verification.tsx",
      lineNumber: 1255,
      columnNumber: 5,
    },
    this,
  );
}
export { Be as default };
