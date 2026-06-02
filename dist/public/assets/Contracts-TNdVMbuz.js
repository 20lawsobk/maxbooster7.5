import {
  r as o,
  a_ as z,
  cc as C,
  bx as $e,
  b$ as E,
  dc as oe,
  eW as Ue,
  cL as le,
  fL as K,
  d0 as je,
  bw as Ve,
  f as e,
  aI as R,
  bu as ls,
  ai as ke,
  ao as ms,
  bK as Ye,
  aK as us,
  aY as ds,
  cU as Ns,
  cv as hs,
  aO as ps,
  c2 as xs,
  ag as fs,
  ah as bs,
  aH as Z,
  aX as gs,
  bg as Ie,
  bQ as vs,
} from "./vendor-react-31oK5L0i.js";
import {
  u as ye,
  C as v,
  d as L,
  f as M,
  B,
  h as ne,
  b as pe,
  k as F,
  g as xe,
  S as ae,
  L as I,
  y as Je,
  I as A,
  x as ws,
  j as x,
  a4 as We,
  a5 as He,
  a6 as ie,
  a9 as ce,
  i as Ee,
  o as G,
  ae as Cs,
  p as ee,
  r as se,
  v as re,
  w as te,
  ac as De,
  W as Ds,
  X as ks,
  Y as Es,
  Z as js,
  $,
} from "./studio-DOUfHW5v.js";
import { a as Vs } from "./index-D5xLbTBZ.js";
import { A as ys } from "./AppLayout-D2pri0rw.js";
import { af as fe } from "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
import "./TopBar-jcH3P98k.js";
const Ss = {
  template_selected: {
    title: "Template Selected",
    description:
      "Contract template has been selected. Fill in the details to continue.",
    icon: C,
    variant: "default",
  },
  contract_drafted: {
    title: "Contract Drafted",
    description:
      "Your contract has been drafted with all parties. Review before sending.",
    icon: C,
    variant: "success",
  },
  contract_customization_saved: {
    title: "Changes Saved",
    description: "Your contract customizations have been saved.",
    icon: E,
    variant: "success",
  },
  validation_passed: {
    title: "Validation Passed",
    description: "All contract terms are valid. Ready to send for signature.",
    icon: E,
    variant: "success",
  },
  validation_errors: {
    title: "Validation Errors",
    description: "Please fix the following errors before proceeding.",
    icon: Ve,
    variant: "destructive",
  },
  signature_requested: {
    title: "Signature Requested",
    description: "Signature request emails have been sent to all parties.",
    icon: je,
    variant: "success",
  },
  signature_pending: {
    title: "Awaiting Signatures",
    description: "Waiting for all parties to sign the contract.",
    icon: z,
    variant: "warning",
  },
  contract_signed: {
    title: "Contract Signed",
    description: "You have successfully signed the contract.",
    icon: K,
    variant: "success",
  },
  signature_declined: {
    title: "Signature Declined",
    description: "A party has declined to sign the contract.",
    icon: le,
    variant: "destructive",
  },
  contract_executed: {
    title: "Contract Executed",
    description: "All parties have signed. The contract is now active.",
    icon: E,
    variant: "success",
  },
  contract_list_loaded: {
    title: "Contracts Loaded",
    description: "Your contracts have been loaded successfully.",
    icon: C,
    variant: "default",
  },
  contract_details_viewed: {
    title: "Contract Details",
    description: "Viewing contract details and signature status.",
    icon: C,
    variant: "default",
  },
  contract_amended: {
    title: "Contract Amended",
    description: "Contract amendment has been created and sent for approval.",
    icon: $e,
    variant: "success",
  },
  contract_terminated: {
    title: "Contract Terminated",
    description: "The contract has been terminated.",
    icon: Ue,
    variant: "destructive",
  },
  split_percentages_defined: {
    title: "Splits Defined",
    description: "Royalty split percentages have been defined.",
    icon: oe,
    variant: "success",
  },
  all_parties_agreed: {
    title: "All Parties Agreed",
    description: "All parties have agreed to the split terms.",
    icon: E,
    variant: "success",
  },
  payments_distributed: {
    title: "Payments Distributed",
    description:
      "Payments have been automatically distributed according to splits.",
    icon: E,
    variant: "success",
  },
  roles_credits_defined: {
    title: "Roles & Credits Set",
    description: "Collaborator roles and credits have been defined.",
    icon: oe,
    variant: "success",
  },
  ownership_shares_specified: {
    title: "Ownership Specified",
    description: "Ownership shares have been specified for all parties.",
    icon: C,
    variant: "success",
  },
  rights_restrictions_set: {
    title: "Rights Configured",
    description: "Rights and restrictions have been set for the contract.",
    icon: C,
    variant: "success",
  },
  preview_generated: {
    title: "Preview Ready",
    description: "Contract preview has been generated.",
    icon: C,
    variant: "default",
  },
  pdf_downloaded: {
    title: "PDF Downloaded",
    description: "Contract PDF has been downloaded successfully.",
    icon: E,
    variant: "success",
  },
  timeline_loaded: {
    title: "Timeline Loaded",
    description: "Contract activity timeline has been loaded.",
    icon: $e,
    variant: "default",
  },
  stats_loaded: {
    title: "Stats Loaded",
    description: "Contract statistics have been loaded.",
    icon: C,
    variant: "default",
  },
  partially_signed: {
    title: "Partially Signed",
    description: "Some parties have signed. Waiting for remaining signatures.",
    icon: z,
    variant: "warning",
  },
};
function Ts({ outcome: i, details: d, onAcknowledge: h }) {
  const { toast: p } = ye(),
    [f, D] = o.useState(null);
  return (
    o.useEffect(() => {
      if (i && i !== f) {
        const a = Ss[i];
        let b = a.description;
        (d?.errors && d.errors.length > 0 && (b = d.errors.join(". ")),
          d?.signedCount !== void 0 &&
            d?.totalCount !== void 0 &&
            (b = `${d.signedCount} of ${d.totalCount} parties have signed.`),
          d?.partyName &&
            i === "signature_declined" &&
            (b = `${d.partyName} declined to sign. Reason: ${d.reason || "Not specified"}`),
          d?.splitTotal !== void 0 &&
            i === "split_percentages_defined" &&
            (b = `Splits total ${d.splitTotal}%. ${d.splitTotal === 100 ? "Valid!" : "Must equal 100%"}`),
          p({
            title: a.title,
            description: b,
            variant: a.variant === "destructive" ? "destructive" : "default",
          }),
          D(i),
          h?.());
      }
    }, [i, d, f, p, h]),
    null
  );
}
const Bs = {
  contract_created: C,
  signature_added: K,
  signature_requested: je,
  contract_executed: E,
  signature_declined: le,
};
function Ps({ signers: i, timeline: d = [], showTimeline: h = !0 }) {
  const p = i.filter((a) => a.status === "signed").length,
    f = i.length,
    D = f > 0 ? (p / f) * 100 : 0;
  return e.jsxDEV(
    "div",
    {
      className: "space-y-4",
      children: [
        e.jsxDEV(
          v,
          {
            children: [
              e.jsxDEV(
                L,
                {
                  className: "pb-2",
                  children: e.jsxDEV(
                    "div",
                    {
                      className: "flex items-center justify-between",
                      children: [
                        e.jsxDEV(
                          M,
                          {
                            className: "text-sm font-medium",
                            children: "Signature Progress",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                            lineNumber: 45,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          B,
                          {
                            variant: p === f ? "default" : "secondary",
                            children: [p, "/", f, " Signed"],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                            lineNumber: 46,
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
                        "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                      lineNumber: 44,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                  lineNumber: 43,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                ne,
                {
                  children: [
                    e.jsxDEV(
                      "div",
                      {
                        className: "w-full bg-muted rounded-full h-2 mb-4",
                        children: e.jsxDEV(
                          "div",
                          {
                            className: pe(
                              "h-2 rounded-full transition-all duration-300",
                              p === f ? "bg-green-500" : "bg-primary",
                            ),
                            style: { width: `${D}%` },
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                            lineNumber: 53,
                            columnNumber: 13,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                        lineNumber: 52,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      "div",
                      {
                        className: "space-y-3",
                        children: i.map((a, b) =>
                          e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center gap-3",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: pe(
                                      "w-8 h-8 rounded-full flex items-center justify-center",
                                      a.status === "signed"
                                        ? "bg-green-100 text-green-600"
                                        : a.status === "declined"
                                          ? "bg-red-100 text-red-600"
                                          : "bg-amber-100 text-amber-600",
                                    ),
                                    children:
                                      a.status === "signed"
                                        ? e.jsxDEV(
                                            E,
                                            { className: "h-4 w-4" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                              lineNumber: 71,
                                              columnNumber: 49,
                                            },
                                            this,
                                          )
                                        : a.status === "declined"
                                          ? e.jsxDEV(
                                              le,
                                              { className: "h-4 w-4" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                                lineNumber: 72,
                                                columnNumber: 51,
                                              },
                                              this,
                                            )
                                          : e.jsxDEV(
                                              z,
                                              { className: "h-4 w-4" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                                lineNumber: 73,
                                                columnNumber: 20,
                                              },
                                              this,
                                            ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                    lineNumber: 65,
                                    columnNumber: 17,
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
                                          className: "flex items-center gap-2",
                                          children: [
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className:
                                                  "font-medium text-sm truncate",
                                                children: a.name,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                                lineNumber: 77,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              B,
                                              {
                                                variant: "outline",
                                                className: "text-xs",
                                                children: a.role,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                                lineNumber: 78,
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
                                            "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                          lineNumber: 76,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "text-xs text-muted-foreground",
                                          children:
                                            a.status === "signed" && a.signedAt
                                              ? `Signed ${fe(new Date(a.signedAt), "MMM d, yyyy h:mm a")}`
                                              : a.status === "declined"
                                                ? "Declined to sign"
                                                : "Awaiting signature",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                          lineNumber: 80,
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
                                      "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                    lineNumber: 75,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                              ],
                            },
                            b,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                              lineNumber: 64,
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
                          "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                        lineNumber: 62,
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
                    "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                  lineNumber: 51,
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
              "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
            lineNumber: 42,
            columnNumber: 7,
          },
          this,
        ),
        h &&
          d.length > 0 &&
          e.jsxDEV(
            v,
            {
              children: [
                e.jsxDEV(
                  L,
                  {
                    className: "pb-2",
                    children: e.jsxDEV(
                      M,
                      {
                        className: "text-sm font-medium",
                        children: "Activity Timeline",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                        lineNumber: 97,
                        columnNumber: 13,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                    lineNumber: 96,
                    columnNumber: 11,
                  },
                  this,
                ),
                e.jsxDEV(
                  ne,
                  {
                    children: e.jsxDEV(
                      "div",
                      {
                        className: "relative",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              className:
                                "absolute left-4 top-0 bottom-0 w-px bg-border",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                              lineNumber: 101,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "div",
                            {
                              className: "space-y-4",
                              children: d.map((a, b) => {
                                const w = Bs[a.event] || C;
                                return e.jsxDEV(
                                  "div",
                                  {
                                    className: "relative flex gap-3 pl-2",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "z-10 w-8 h-8 rounded-full bg-background border flex items-center justify-center",
                                          children: e.jsxDEV(
                                            w,
                                            {
                                              className:
                                                "h-4 w-4 text-muted-foreground",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                              lineNumber: 108,
                                              columnNumber: 25,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                          lineNumber: 107,
                                          columnNumber: 23,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: "flex-1 pt-1",
                                          children: [
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-sm font-medium",
                                                children: a.event
                                                  .replace(/_/g, " ")
                                                  .replace(/\b\w/g, (c) =>
                                                    c.toUpperCase(),
                                                  ),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                                lineNumber: 111,
                                                columnNumber: 25,
                                              },
                                              this,
                                            ),
                                            a.actor &&
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-xs text-muted-foreground",
                                                  children: ["by ", a.actor],
                                                },
                                                void 0,
                                                !0,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                                  lineNumber: 115,
                                                  columnNumber: 27,
                                                },
                                                this,
                                              ),
                                            a.details &&
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-xs text-muted-foreground mt-1",
                                                  children: a.details,
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                                  lineNumber: 118,
                                                  columnNumber: 27,
                                                },
                                                this,
                                              ),
                                            e.jsxDEV(
                                              "p",
                                              {
                                                className:
                                                  "text-xs text-muted-foreground mt-1",
                                                children: fe(
                                                  new Date(a.timestamp),
                                                  "MMM d, yyyy h:mm a",
                                                ),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                                lineNumber: 120,
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
                                            "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                          lineNumber: 110,
                                          columnNumber: 23,
                                        },
                                        this,
                                      ),
                                    ],
                                  },
                                  b,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                                    lineNumber: 106,
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
                                "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
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
                          "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                        lineNumber: 100,
                        columnNumber: 13,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
                    lineNumber: 99,
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
                "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
              lineNumber: 95,
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
        "/home/runner/workspace/client/src/components/contracts/SignatureTimeline.tsx",
      lineNumber: 41,
      columnNumber: 5,
    },
    this,
  );
}
function _s({
  template: i,
  initialVariables: d = {},
  onPreview: h,
  onSubmit: p,
  isSubmitting: f,
}) {
  const { toast: D } = ye(),
    [a, b] = o.useState(d),
    [w, c] = o.useState([{ name: "", percentage: 100, role: "Artist" }]),
    [l, k] = o.useState(null),
    V = o.useRef(null),
    P = R({
      mutationFn: async () => {
        const t = F();
        return (
          await fetch("/api/contracts/validate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(t ? { "x-csrf-token": t } : {}),
            },
            credentials: "include",
            body: JSON.stringify({
              templateId: i.id,
              variables: i.variables.includes("splits")
                ? { ...a, splits: w }
                : a,
            }),
          })
        ).json();
      },
      onSuccess: (t) => {
        k({
          valid: t.valid,
          errors: t.errors || [],
          warnings: t.warnings || [],
        });
      },
    }),
    Q = R({
      mutationFn: async () => {
        const t = F();
        return (
          await fetch("/api/contracts/preview", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(t ? { "x-csrf-token": t } : {}),
            },
            credentials: "include",
            body: JSON.stringify({
              templateId: i.id,
              variables: i.variables.includes("splits")
                ? { ...a, splits: w }
                : a,
            }),
          })
        ).json();
      },
      onSuccess: (t) => {
        t.content && h(t.content);
      },
    });
  o.useEffect(() => {
    if (Object.keys(a).length > 0)
      return (
        V.current && clearTimeout(V.current),
        (V.current = setTimeout(() => {
          (P.mutate(), (V.current = null));
        }, 500)),
        () => {
          V.current && (clearTimeout(V.current), (V.current = null));
        }
      );
  }, [a, w]);
  const y = (t, N) => {
      b((u) => ({ ...u, [t]: N }));
    },
    m = (t, N, u) => {
      c((W) => {
        const ue = [...W];
        return ((ue[t] = { ...ue[t], [N]: u }), ue);
      });
    },
    O = () => {
      c((t) => [...t, { name: "", percentage: 0, role: "Contributor" }]);
    },
    be = (t) => {
      w.length > 1 && c((N) => N.filter((u, W) => W !== t));
    },
    me =
      Math.round(w.reduce((t, N) => t + (Number(N.percentage) || 0), 0) * 100) /
      100,
    U = () => {
      if (V.current || P.isPending) {
        D({
          title: "Validating…",
          description:
            "Please wait a moment while we check your contract details.",
        });
        return;
      }
      if (l?.errors && l.errors.length > 0) {
        D({
          title: "Validation Errors",
          description: "Please fix all errors before creating the contract.",
          variant: "destructive",
        });
        return;
      }
      p(i.variables.includes("splits") ? { ...a, splits: w } : a);
    },
    Y = (t) =>
      t
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (N) => N.toUpperCase())
        .trim(),
    J = (t) =>
      t.includes("Price") ||
      t.includes("Fee") ||
      t.includes("Amount") ||
      t.includes("Rate") ||
      t.includes("Percentage") ||
      t.includes("Limit") ||
      t.includes("Hours")
        ? "number"
        : t.includes("Date")
          ? "date"
          : t.includes("description") ||
              t.includes("terms") ||
              t.includes("Terms")
            ? "textarea"
            : "text";
  return e.jsxDEV(
    "div",
    {
      className: "space-y-6",
      children: [
        e.jsxDEV(
          v,
          {
            className: "border-primary/20",
            children: e.jsxDEV(
              L,
              {
                className: "pb-3",
                children: [
                  e.jsxDEV(
                    "div",
                    {
                      className: "flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          M,
                          { className: "text-lg", children: i.name },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                            lineNumber: 181,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        i.isPremium &&
                          e.jsxDEV(
                            B,
                            { variant: "secondary", children: "Premium" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                              lineNumber: 182,
                              columnNumber: 36,
                            },
                            this,
                          ),
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                      lineNumber: 180,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    xe,
                    { children: i.description },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
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
                fileName:
                  "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                lineNumber: 179,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
            lineNumber: 178,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          "div",
          {
            className: "grid md:grid-cols-2 gap-6",
            children: [
              e.jsxDEV(
                "div",
                {
                  className: "space-y-4",
                  children: [
                    e.jsxDEV(
                      "h3",
                      {
                        className: "font-medium",
                        children: "Contract Details",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                        lineNumber: 190,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      ae,
                      {
                        className: "h-[400px] pr-4",
                        children: e.jsxDEV(
                          "div",
                          {
                            className: "space-y-4",
                            children: [
                              i.variables
                                .filter((t) => t !== "splits")
                                .map((t) => {
                                  const N = J(t);
                                  return e.jsxDEV(
                                    "div",
                                    {
                                      className: "space-y-2",
                                      children: [
                                        e.jsxDEV(
                                          I,
                                          { htmlFor: t, children: Y(t) },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                            lineNumber: 198,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        N === "textarea"
                                          ? e.jsxDEV(
                                              Je,
                                              {
                                                id: t,
                                                value: a[t] || "",
                                                onChange: (u) =>
                                                  y(t, u.target.value),
                                                rows: 3,
                                                placeholder: `Enter ${Y(t).toLowerCase()}`,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                lineNumber: 200,
                                                columnNumber: 23,
                                              },
                                              this,
                                            )
                                          : N === "number"
                                            ? e.jsxDEV(
                                                A,
                                                {
                                                  id: t,
                                                  type: "number",
                                                  value: a[t] || "",
                                                  onChange: (u) =>
                                                    y(t, u.target.value),
                                                  placeholder: "0",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                  lineNumber: 208,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              )
                                            : N === "date"
                                              ? e.jsxDEV(
                                                  A,
                                                  {
                                                    id: t,
                                                    type: "date",
                                                    value: a[t] || "",
                                                    onChange: (u) =>
                                                      y(t, u.target.value),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                    lineNumber: 216,
                                                    columnNumber: 23,
                                                  },
                                                  this,
                                                )
                                              : e.jsxDEV(
                                                  A,
                                                  {
                                                    id: t,
                                                    value: a[t] || "",
                                                    onChange: (u) =>
                                                      y(t, u.target.value),
                                                    placeholder: `Enter ${Y(t).toLowerCase()}`,
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                    lineNumber: 223,
                                                    columnNumber: 23,
                                                  },
                                                  this,
                                                ),
                                      ],
                                    },
                                    t,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                      lineNumber: 197,
                                      columnNumber: 19,
                                    },
                                    this,
                                  );
                                }),
                              i.variables.includes("splits") &&
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "space-y-3 pt-4",
                                    children: [
                                      e.jsxDEV(
                                        ws,
                                        {},
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                          lineNumber: 236,
                                          columnNumber: 19,
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
                                              I,
                                              { children: "Royalty Splits" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                lineNumber: 238,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              B,
                                              {
                                                variant:
                                                  me === 100
                                                    ? "default"
                                                    : "destructive",
                                                children: ["Total: ", me, "%"],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                lineNumber: 239,
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
                                            "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                          lineNumber: 237,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      w.map((t, N) =>
                                        e.jsxDEV(
                                          v,
                                          {
                                            className: "p-3",
                                            children: e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "grid grid-cols-3 gap-2",
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      children: [
                                                        e.jsxDEV(
                                                          I,
                                                          {
                                                            className:
                                                              "text-xs",
                                                            children: "Name",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                            lineNumber: 250,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          A,
                                                          {
                                                            value: t.name,
                                                            onChange: (u) =>
                                                              m(
                                                                N,
                                                                "name",
                                                                u.target.value,
                                                              ),
                                                            placeholder: "Name",
                                                            className: "h-8",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                            lineNumber: 251,
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
                                                        "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                      lineNumber: 249,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      children: [
                                                        e.jsxDEV(
                                                          I,
                                                          {
                                                            className:
                                                              "text-xs",
                                                            children:
                                                              "Percentage",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                            lineNumber: 259,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          A,
                                                          {
                                                            type: "number",
                                                            value: t.percentage,
                                                            onChange: (u) =>
                                                              m(
                                                                N,
                                                                "percentage",
                                                                parseFloat(
                                                                  u.target
                                                                    .value,
                                                                ) || 0,
                                                              ),
                                                            placeholder: "%",
                                                            className: "h-8",
                                                            min: 0,
                                                            max: 100,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                            lineNumber: 260,
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
                                                        "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                      lineNumber: 258,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex items-end gap-1",
                                                      children: [
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className: "flex-1",
                                                            children: [
                                                              e.jsxDEV(
                                                                I,
                                                                {
                                                                  className:
                                                                    "text-xs",
                                                                  children:
                                                                    "Role",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                                  lineNumber: 272,
                                                                  columnNumber: 29,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                A,
                                                                {
                                                                  value: t.role,
                                                                  onChange: (
                                                                    u,
                                                                  ) =>
                                                                    m(
                                                                      N,
                                                                      "role",
                                                                      u.target
                                                                        .value,
                                                                    ),
                                                                  placeholder:
                                                                    "Role",
                                                                  className:
                                                                    "h-8",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                                  lineNumber: 273,
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
                                                              "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                            lineNumber: 271,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                        w.length > 1 &&
                                                          e.jsxDEV(
                                                            x,
                                                            {
                                                              variant: "ghost",
                                                              size: "icon",
                                                              className:
                                                                "h-8 w-8",
                                                              onClick: () =>
                                                                be(N),
                                                              children:
                                                                e.jsxDEV(
                                                                  ls,
                                                                  {
                                                                    className:
                                                                      "h-4 w-4",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                                    lineNumber: 287,
                                                                    columnNumber: 31,
                                                                  },
                                                                  this,
                                                                ),
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                              lineNumber: 281,
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
                                                        "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                      lineNumber: 270,
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
                                                  "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                lineNumber: 248,
                                                columnNumber: 23,
                                              },
                                              this,
                                            ),
                                          },
                                          N,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                            lineNumber: 247,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      ),
                                      e.jsxDEV(
                                        x,
                                        {
                                          variant: "outline",
                                          size: "sm",
                                          onClick: O,
                                          className: "w-full",
                                          children: [
                                            e.jsxDEV(
                                              ke,
                                              { className: "h-4 w-4 mr-2" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                lineNumber: 296,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            "Add Participant",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                          lineNumber: 295,
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
                                      "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                    lineNumber: 235,
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
                              "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                            lineNumber: 193,
                            columnNumber: 13,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                        lineNumber: 192,
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
                    "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                  lineNumber: 189,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                "div",
                {
                  className: "space-y-4",
                  children: [
                    e.jsxDEV(
                      "h3",
                      {
                        className: "font-medium",
                        children: "Validation Status",
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                        lineNumber: 306,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      v,
                      {
                        className: pe(
                          "p-4",
                          l?.valid === !0 &&
                            "border-green-500/50 bg-green-50/50 dark:bg-green-950/20",
                          l?.valid === !1 &&
                            "border-red-500/50 bg-red-50/50 dark:bg-red-950/20",
                          l === null && "bg-muted/50",
                        ),
                        children: [
                          l === null
                            ? e.jsxDEV(
                                "p",
                                {
                                  className: "text-sm text-muted-foreground",
                                  children:
                                    "Fill in the contract details to validate",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                  lineNumber: 315,
                                  columnNumber: 15,
                                },
                                this,
                              )
                            : l.valid
                              ? e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "flex items-center gap-2 text-green-600",
                                    children: [
                                      e.jsxDEV(
                                        E,
                                        { className: "h-5 w-5" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                          lineNumber: 320,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "span",
                                        {
                                          className: "font-medium",
                                          children: "All fields are valid",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                          lineNumber: 321,
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
                                      "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                    lineNumber: 319,
                                    columnNumber: 15,
                                  },
                                  this,
                                )
                              : e.jsxDEV(
                                  "div",
                                  {
                                    className: "space-y-2",
                                    children: l.errors.map((t, N) =>
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "flex items-start gap-2 text-red-600",
                                          children: [
                                            e.jsxDEV(
                                              ms,
                                              {
                                                className:
                                                  "h-4 w-4 mt-0.5 flex-shrink-0",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                lineNumber: 327,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className: "text-sm",
                                                children: t,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                                lineNumber: 328,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                          ],
                                        },
                                        N,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                          lineNumber: 326,
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
                                      "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                    lineNumber: 324,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                          l?.warnings &&
                            l.warnings.length > 0 &&
                            e.jsxDEV(
                              "div",
                              {
                                className: "mt-3 pt-3 border-t space-y-2",
                                children: l.warnings.map((t, N) =>
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className:
                                        "flex items-start gap-2 text-amber-600",
                                      children: [
                                        e.jsxDEV(
                                          Ve,
                                          {
                                            className:
                                              "h-4 w-4 mt-0.5 flex-shrink-0",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                            lineNumber: 338,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "span",
                                          { className: "text-sm", children: t },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                            lineNumber: 339,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      ],
                                    },
                                    N,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                      lineNumber: 337,
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
                                  "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                lineNumber: 335,
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
                          "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                        lineNumber: 308,
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
                            x,
                            {
                              variant: "outline",
                              className: "flex-1",
                              onClick: () => Q.mutate(),
                              disabled: Q.isPending,
                              children: [
                                e.jsxDEV(
                                  Ye,
                                  { className: "h-4 w-4 mr-2" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                                    lineNumber: 353,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                Q.isPending ? "Generating..." : "Preview",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                              lineNumber: 347,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            x,
                            {
                              className: "flex-1",
                              onClick: U,
                              disabled: f || l?.valid === !1,
                              children: f ? "Creating..." : "Create Contract",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                              lineNumber: 356,
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
                          "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                        lineNumber: 346,
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
                    "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
                  lineNumber: 305,
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
              "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
            lineNumber: 188,
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
        "/home/runner/workspace/client/src/components/contracts/ContractBuilder.tsx",
      lineNumber: 177,
      columnNumber: 5,
    },
    this,
  );
}
const As = {
    "Beat Licenses": ps,
    Legal: hs,
    Collaboration: oe,
    Royalties: Ns,
    Licensing: C,
    Production: ds,
  },
  Ke = {
    "Beat Licenses": "License agreements for beats and instrumentals",
    Legal: "NDAs, work-for-hire, and other legal documents",
    Collaboration:
      "Agreements for working with session musicians and engineers",
    Royalties: "Split sheets and royalty distribution agreements",
    Licensing: "Sync licensing and media use agreements",
    Production: "Producer agreements and production contracts",
  };
function ze({ templates: i, categories: d, onSelect: h }) {
  const [p, f] = o.useState(""),
    [D, a] = o.useState("all"),
    b = i.filter((c) => {
      const l =
          c.name.toLowerCase().includes(p.toLowerCase()) ||
          c.description.toLowerCase().includes(p.toLowerCase()),
        k = D === "all" || c.category === D;
      return l && k;
    }),
    w = (c) => {
      const l = As[c] || C;
      return e.jsxDEV(
        l,
        { className: "h-4 w-4" },
        void 0,
        !1,
        {
          fileName:
            "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
          lineNumber: 57,
          columnNumber: 12,
        },
        this,
      );
    };
  return e.jsxDEV(
    "div",
    {
      className: "space-y-4",
      children: [
        e.jsxDEV(
          "div",
          {
            className: "relative",
            children: [
              e.jsxDEV(
                us,
                {
                  className:
                    "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                  lineNumber: 63,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                A,
                {
                  placeholder: "Search templates...",
                  value: p,
                  onChange: (c) => f(c.target.value),
                  className: "pl-10",
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                  lineNumber: 64,
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
              "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
            lineNumber: 62,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          We,
          {
            value: D,
            onValueChange: a,
            children: [
              e.jsxDEV(
                ae,
                {
                  className: "w-full",
                  children: e.jsxDEV(
                    He,
                    {
                      className: "inline-flex w-auto",
                      children: [
                        e.jsxDEV(
                          ie,
                          {
                            value: "all",
                            className: "flex items-center gap-1",
                            children: [
                              e.jsxDEV(
                                C,
                                { className: "h-3 w-3" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                                  lineNumber: 76,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              "All",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                            lineNumber: 75,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        d.map((c) =>
                          e.jsxDEV(
                            ie,
                            {
                              value: c,
                              className: "flex items-center gap-1",
                              children: [w(c), c],
                            },
                            c,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                              lineNumber: 80,
                              columnNumber: 15,
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
                        "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                      lineNumber: 74,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                  lineNumber: 73,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                ce,
                {
                  value: "all",
                  className: "mt-4",
                  children: e.jsxDEV(
                    "div",
                    {
                      className: "space-y-4",
                      children: d.map((c) => {
                        const l = b.filter((k) => k.category === c);
                        return l.length === 0
                          ? null
                          : e.jsxDEV(
                              "div",
                              {
                                children: [
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className: "flex items-center gap-2 mb-3",
                                      children: [
                                        w(c),
                                        e.jsxDEV(
                                          "h3",
                                          {
                                            className: "font-medium",
                                            children: c,
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                                            lineNumber: 98,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          B,
                                          {
                                            variant: "outline",
                                            className: "ml-2",
                                            children: l.length,
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                                            lineNumber: 99,
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
                                        "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                                      lineNumber: 96,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className: "grid md:grid-cols-2 gap-3",
                                      children: l.map((k) =>
                                        e.jsxDEV(
                                          Qe,
                                          {
                                            template: k,
                                            onSelect: h,
                                            getCategoryIcon: w,
                                          },
                                          k.id,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                                            lineNumber: 103,
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
                                        "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                                      lineNumber: 101,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                ],
                              },
                              c,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                                lineNumber: 95,
                                columnNumber: 17,
                              },
                              this,
                            );
                      }),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                      lineNumber: 89,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                  lineNumber: 88,
                  columnNumber: 9,
                },
                this,
              ),
              d.map((c) =>
                e.jsxDEV(
                  ce,
                  {
                    value: c,
                    className: "mt-4",
                    children: [
                      Ke[c] &&
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-sm text-muted-foreground mb-4",
                            children: Ke[c],
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                            lineNumber: 120,
                            columnNumber: 15,
                          },
                          this,
                        ),
                      e.jsxDEV(
                        "div",
                        {
                          className: "grid md:grid-cols-2 gap-3",
                          children: b
                            .filter((l) => l.category === c)
                            .map((l) =>
                              e.jsxDEV(
                                Qe,
                                {
                                  template: l,
                                  onSelect: h,
                                  getCategoryIcon: w,
                                },
                                l.id,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                                  lineNumber: 124,
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
                            "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                          lineNumber: 122,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    ],
                  },
                  c,
                  !0,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                    lineNumber: 118,
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
            fileName:
              "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
            lineNumber: 72,
            columnNumber: 7,
          },
          this,
        ),
        b.length === 0 &&
          e.jsxDEV(
            v,
            {
              className: "p-8 text-center",
              children: [
                e.jsxDEV(
                  C,
                  { className: "h-12 w-12 text-muted-foreground mx-auto mb-4" },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                    lineNumber: 138,
                    columnNumber: 11,
                  },
                  this,
                ),
                e.jsxDEV(
                  "h3",
                  { className: "font-medium", children: "No templates found" },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                    lineNumber: 139,
                    columnNumber: 11,
                  },
                  this,
                ),
                e.jsxDEV(
                  "p",
                  {
                    className: "text-sm text-muted-foreground mt-1",
                    children: "Try adjusting your search or filter",
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                    lineNumber: 140,
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
                "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
              lineNumber: 137,
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
        "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
      lineNumber: 61,
      columnNumber: 5,
    },
    this,
  );
}
function Qe({ template: i, onSelect: d, getCategoryIcon: h }) {
  return e.jsxDEV(
    v,
    {
      className: pe(
        "cursor-pointer hover:border-primary/50 transition-all hover:shadow-md",
        i.isPremium && "border-amber-500/30",
      ),
      onClick: () => d(i),
      children: [
        e.jsxDEV(
          L,
          {
            className: "p-4 pb-2",
            children: [
              e.jsxDEV(
                "div",
                {
                  className: "flex items-start justify-between",
                  children: [
                    e.jsxDEV(
                      M,
                      {
                        className: "text-sm flex items-center gap-2",
                        children: [h(i.category), i.name],
                      },
                      void 0,
                      !0,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                        lineNumber: 168,
                        columnNumber: 11,
                      },
                      this,
                    ),
                    i.isPremium &&
                      e.jsxDEV(
                        B,
                        {
                          variant: "outline",
                          className: "text-amber-600 border-amber-500/50",
                          children: [
                            e.jsxDEV(
                              xs,
                              { className: "h-3 w-3 mr-1" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                                lineNumber: 174,
                                columnNumber: 15,
                              },
                              this,
                            ),
                            "Pro",
                          ],
                        },
                        void 0,
                        !0,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                          lineNumber: 173,
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
                    "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                  lineNumber: 167,
                  columnNumber: 9,
                },
                this,
              ),
              e.jsxDEV(
                xe,
                {
                  className: "text-xs line-clamp-2 mt-1",
                  children: i.description,
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                  lineNumber: 179,
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
              "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
            lineNumber: 166,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          Ee,
          {
            className: "p-4 pt-2",
            children: e.jsxDEV(
              "div",
              {
                className: "flex items-center justify-between w-full",
                children: [
                  e.jsxDEV(
                    "span",
                    {
                      className: "text-xs text-muted-foreground",
                      children: [i.variables.length, " fields"],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                      lineNumber: 185,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    x,
                    {
                      size: "sm",
                      variant: "ghost",
                      className: "h-7",
                      children: "Use Template",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                      lineNumber: 188,
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
                  "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
                lineNumber: 184,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
            lineNumber: 183,
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
        "/home/runner/workspace/client/src/components/contracts/TemplateBrowser.tsx",
      lineNumber: 159,
      columnNumber: 5,
    },
    this,
  );
}
function Qs() {
  const { user: i } = Vs(),
    [, d] = fs(),
    { toast: h } = ye(),
    p = bs(),
    [f, D] = o.useState(null),
    [a, b] = o.useState(!1),
    [w, c] = o.useState(!1),
    [l, k] = o.useState(!1),
    [V, P] = o.useState(!1),
    [Q, y] = o.useState(!1),
    [m, O] = o.useState(null),
    [be, me] = o.useState(""),
    [U, Y] = o.useState("all"),
    [J, t] = o.useState(""),
    [N, u] = o.useState(null),
    [W, ue] = o.useState(null),
    [T, H] = o.useState("pick"),
    [X, de] = o.useState(""),
    [Xe, Rs] = o.useState([]),
    _ = o.useRef(null),
    ge = o.useRef(!1),
    q = o.useRef(null),
    Se = (s, r) => {
      const n = s.getBoundingClientRect();
      return "touches" in r
        ? { x: r.touches[0].clientX - n.left, y: r.touches[0].clientY - n.top }
        : { x: r.clientX - n.left, y: r.clientY - n.top };
    },
    ve = o.useCallback(() => {
      const s = _.current;
      if (!s) return;
      const r = s.getContext("2d");
      if (!r) return;
      const n = window.devicePixelRatio || 1,
        g = s.getBoundingClientRect();
      (g.width > 0
        ? ((s.width = Math.round(g.width * n)),
          (s.height = Math.round(Math.max(g.height, 180) * n)),
          r.scale(n, n))
        : r.clearRect(0, 0, s.width, s.height),
        (r.strokeStyle = "#1e293b"),
        (r.lineWidth = 2.5),
        (r.lineCap = "round"),
        (r.lineJoin = "round"));
    }, []);
  (o.useEffect(() => {
    T === "draw" && setTimeout(ve, 50);
  }, [T, ve]),
    o.useEffect(() => {
      const s = _.current;
      if (!s || T !== "draw") return;
      const r = (n) => n.preventDefault();
      return (
        s.addEventListener("touchstart", r, { passive: !1 }),
        s.addEventListener("touchmove", r, { passive: !1 }),
        () => {
          (s.removeEventListener("touchstart", r),
            s.removeEventListener("touchmove", r));
        }
      );
    }, [T]));
  const Te = o.useCallback((s) => {
      const r = _.current;
      r && (s.preventDefault(), (ge.current = !0), (q.current = Se(r, s)));
    }, []),
    Be = o.useCallback((s) => {
      if (!ge.current) return;
      const r = _.current;
      if (!r) return;
      s.preventDefault();
      const n = r.getContext("2d");
      if (!n || !q.current) return;
      const g = Se(r, s);
      (n.beginPath(),
        n.moveTo(q.current.x, q.current.y),
        n.lineTo(g.x, g.y),
        n.stroke(),
        (q.current = g));
    }, []),
    we = o.useCallback(() => {
      ((ge.current = !1), (q.current = null));
    }, []),
    Ze = () => ve(),
    Ge = () => {
      const s = _.current;
      if (!s) return !0;
      const r = s.getContext("2d");
      return r
        ? !r.getImageData(0, 0, s.width, s.height).data.some((g) => g !== 0)
        : !0;
    },
    es = () => {
      const s = _.current;
      if (!s || !m || !X) return;
      if (Ge()) {
        h({
          title: "Signature required",
          description: "Please draw your signature before submitting.",
          variant: "destructive",
        });
        return;
      }
      const r = s.toDataURL("image/png");
      Ce.mutate({ contractId: m.id, partyName: X, signatureData: r });
    },
    { data: Pe } = Z({ queryKey: ["/api/contracts/templates"], enabled: !!i }),
    { data: ss, refetch: rs } = Z({
      queryKey: ["/api/contracts/my-contracts"],
      enabled: !!i,
      staleTime: 0,
      refetchInterval: 3e3,
      refetchIntervalInBackground: !0,
      retry: 2,
      retryDelay: 2e3,
    }),
    { data: ts } = Z({
      queryKey: ["/api/contracts/stats/summary"],
      enabled: !!i,
    }),
    { data: ns } = Z({
      queryKey: ["/api/contracts", m?.id, "timeline"],
      enabled: !!m?.id && l,
    }),
    { data: as } = Z({
      queryKey: ["/api/contracts", m?.id, "signature-status"],
      enabled: !!m?.id && l,
    }),
    _e = R({
      mutationFn: async (s) => {
        if (!f) throw new Error("No template selected");
        const r = F(),
          n = await fetch("/api/contracts/generate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(r ? { "x-csrf-token": r } : {}),
            },
            credentials: "include",
            body: JSON.stringify({ templateId: f.id, variables: s }),
          });
        if (!n.ok) throw new Error("Failed to generate contract");
        return n.json();
      },
      onSuccess: (s) => {
        (p.setQueryData(["/api/contracts/my-contracts"], (r) => ({
          contracts: [s, ...(r?.contracts ?? [])],
        })),
          p.invalidateQueries({ queryKey: ["/api/contracts/stats/summary"] }),
          b(!1),
          D(null),
          u("contract_drafted"),
          h({
            title: "Contract created",
            description:
              "Your contract has been generated and saved as a draft.",
          }),
          rs());
      },
      onError: (s) => {
        h({ title: "Error", description: s.message, variant: "destructive" });
      },
    }),
    Ae = R({
      mutationFn: async (s) => {
        const r = F(),
          n = await fetch(`/api/contracts/${s}/send-for-signature`, {
            method: "POST",
            credentials: "include",
            headers: r ? { "x-csrf-token": r } : {},
          });
        if (!n.ok) throw new Error("Failed to send for signature");
        return n.json();
      },
      onSuccess: () => {
        (p.invalidateQueries({ queryKey: ["/api/contracts/my-contracts"] }),
          p.invalidateQueries({ queryKey: ["/api/contracts/stats/summary"] }),
          u("signature_requested"),
          h({
            title: "Signature requested",
            description: "The contract has been sent for signature.",
          }));
      },
      onError: (s) => {
        h({ title: "Error", description: s.message, variant: "destructive" });
      },
    }),
    Ce = R({
      mutationFn: async ({ contractId: s, partyName: r, signatureData: n }) => {
        const g = F(),
          S = await fetch(`/api/contracts/${s}/sign`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(g ? { "x-csrf-token": g } : {}),
            },
            credentials: "include",
            body: JSON.stringify({ partyName: r, signature: n }),
          });
        if (!S.ok) throw new Error("Failed to sign contract");
        return S.json();
      },
      onSuccess: (s) => {
        (p.invalidateQueries({ queryKey: ["/api/contracts/my-contracts"] }),
          p.invalidateQueries({ queryKey: ["/api/contracts/stats/summary"] }),
          P(!1),
          H("pick"),
          de(""),
          s.status === "fully_executed"
            ? u("contract_executed")
            : u("contract_signed"),
          h({
            title: "Contract signed",
            description: "Your signature has been recorded.",
          }));
      },
      onError: (s) => {
        h({ title: "Error", description: s.message, variant: "destructive" });
      },
    }),
    Re = R({
      mutationFn: async ({ contractId: s, partyName: r, reason: n }) => {
        const g = F(),
          S = await fetch(`/api/contracts/${s}/decline`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(g ? { "x-csrf-token": g } : {}),
            },
            credentials: "include",
            body: JSON.stringify({ partyName: r, reason: n }),
          });
        if (!S.ok) throw new Error("Failed to decline signature");
        return S.json();
      },
      onSuccess: () => {
        (p.invalidateQueries({ queryKey: ["/api/contracts/my-contracts"] }),
          p.invalidateQueries({ queryKey: ["/api/contracts/stats/summary"] }),
          y(!1),
          t(""),
          u("signature_declined"),
          h({
            title: "Signature declined",
            description: "The contract has been voided.",
          }));
      },
      onError: (s) => {
        h({ title: "Error", description: s.message, variant: "destructive" });
      },
    }),
    is = R({
      mutationFn: async (s) => {
        const r = F(),
          n = await fetch(`/api/contracts/${s}/void`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(r ? { "x-csrf-token": r } : {}),
            },
            credentials: "include",
            body: JSON.stringify({ reason: "Cancelled by user" }),
          });
        if (!n.ok) throw new Error("Failed to void contract");
        return n.json();
      },
      onSuccess: () => {
        (p.invalidateQueries({ queryKey: ["/api/contracts/my-contracts"] }),
          p.invalidateQueries({ queryKey: ["/api/contracts/stats/summary"] }),
          k(!1),
          u("contract_terminated"),
          h({
            title: "Contract voided",
            description: "The contract has been terminated.",
          }));
      },
      onError: (s) => {
        h({ title: "Error", description: s.message, variant: "destructive" });
      },
    }),
    Fe = async (s) => {
      try {
        const r = await fetch(`/api/contracts/${s}/pdf`, {
          credentials: "include",
        });
        if (!r.ok) throw new Error("Failed to download PDF");
        const n = await r.blob(),
          g = URL.createObjectURL(n),
          S = document.createElement("a");
        ((S.href = g),
          (S.download = `contract-${s}.pdf`),
          S.click(),
          URL.revokeObjectURL(g),
          u("pdf_downloaded"),
          h({
            title: "PDF downloaded",
            description: "Contract PDF has been downloaded.",
          }));
      } catch (r) {
        h({ title: "Error", description: r.message, variant: "destructive" });
      }
    },
    Le = Pe?.templates || [],
    Me = Pe?.categories || [],
    Oe = ss?.contracts || [],
    cs = new Set(Oe.map((s) => s.id)),
    Ne = [...Oe, ...Xe.filter((s) => !cs.has(s.id))],
    j = ts?.stats,
    he = U === "all" ? Ne : Ne.filter((s) => s.status === U),
    qe = (s) => {
      const r = {
          draft: { variant: "outline", label: "Draft", icon: C },
          pending_signature: {
            variant: "secondary",
            label: "Awaiting Signature",
            icon: z,
          },
          partially_signed: {
            variant: "secondary",
            label: "Partially Signed",
            icon: K,
          },
          fully_executed: { variant: "default", label: "Executed", icon: E },
          voided: { variant: "destructive", label: "Voided", icon: le },
          expired: { variant: "outline", label: "Expired", icon: Ve },
        },
        n = r[s] || r.draft,
        g = n.icon;
      return e.jsxDEV(
        B,
        {
          variant: n.variant,
          className: "flex items-center gap-1",
          children: [
            e.jsxDEV(
              g,
              { className: "h-3 w-3" },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                lineNumber: 415,
                columnNumber: 9,
              },
              this,
            ),
            n.label,
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Contracts.tsx",
          lineNumber: 414,
          columnNumber: 7,
        },
        this,
      );
    },
    os = (s) => {
      (D(s), u("template_selected"));
    };
  return i
    ? e.jsxDEV(
        ys,
        {
          children: [
            e.jsxDEV(
              Ts,
              { outcome: N, details: W, onAcknowledge: () => u(null) },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                lineNumber: 433,
                columnNumber: 7,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                className: "space-y-6",
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
                                      C,
                                      { className: "h-8 w-8 text-primary" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                        lineNumber: 443,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    "Contracts",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                  lineNumber: 442,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "p",
                                {
                                  className: "text-muted-foreground mt-1",
                                  children:
                                    "Create, manage, and sign legal contracts for your music business",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                  lineNumber: 446,
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
                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                            lineNumber: 441,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          G,
                          {
                            open: a,
                            onOpenChange: (s) => {
                              (b(s), s || D(null));
                            },
                            children: [
                              e.jsxDEV(
                                Cs,
                                {
                                  asChild: !0,
                                  children: e.jsxDEV(
                                    x,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          ke,
                                          { className: "h-4 w-4 mr-2" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                            lineNumber: 456,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        "New Contract",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 455,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                  lineNumber: 454,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                ee,
                                {
                                  className:
                                    "max-w-4xl max-h-[90vh] overflow-hidden",
                                  children: [
                                    e.jsxDEV(
                                      se,
                                      {
                                        children: [
                                          e.jsxDEV(
                                            re,
                                            {
                                              children: f
                                                ? `Create ${f.name}`
                                                : "Create New Contract",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 462,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            te,
                                            {
                                              children: f
                                                ? "Fill in the contract details below"
                                                : "Choose a template to get started",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 465,
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
                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                        lineNumber: 461,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      ae,
                                      {
                                        className: "max-h-[70vh]",
                                        children: f
                                          ? e.jsxDEV(
                                              _s,
                                              {
                                                template: f,
                                                onPreview: (s) => {
                                                  (me(s), c(!0));
                                                },
                                                onSubmit: (s) => _e.mutate(s),
                                                isSubmitting: _e.isPending,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                lineNumber: 481,
                                                columnNumber: 19,
                                              },
                                              this,
                                            )
                                          : e.jsxDEV(
                                              ze,
                                              {
                                                templates: Le,
                                                categories: Me,
                                                onSelect: os,
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                lineNumber: 475,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                        lineNumber: 473,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    f &&
                                      e.jsxDEV(
                                        De,
                                        {
                                          children: e.jsxDEV(
                                            x,
                                            {
                                              variant: "outline",
                                              onClick: () => D(null),
                                              children: "Back to Templates",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 495,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                          lineNumber: 494,
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
                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                  lineNumber: 460,
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
                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                            lineNumber: 450,
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
                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                      lineNumber: 440,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  j &&
                    e.jsxDEV(
                      "div",
                      {
                        className:
                          "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3",
                        children: [
                          e.jsxDEV(
                            v,
                            {
                              className: "p-3",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-2xl font-bold",
                                    children: j.total,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 507,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-xs text-muted-foreground",
                                    children: "Total",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 508,
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
                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                              lineNumber: 506,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            v,
                            {
                              className: "p-3",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "text-2xl font-bold text-muted-foreground",
                                    children: j.draft,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 511,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-xs text-muted-foreground",
                                    children: "Drafts",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 512,
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
                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                              lineNumber: 510,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            v,
                            {
                              className: "p-3",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "text-2xl font-bold text-amber-500",
                                    children: j.pendingSignature,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 515,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-xs text-muted-foreground",
                                    children: "Pending",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 516,
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
                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                              lineNumber: 514,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            v,
                            {
                              className: "p-3",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "text-2xl font-bold text-blue-500",
                                    children: j.partiallySigned,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 519,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-xs text-muted-foreground",
                                    children: "Partial",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 520,
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
                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                              lineNumber: 518,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            v,
                            {
                              className: "p-3",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "text-2xl font-bold text-green-500",
                                    children: j.fullyExecuted,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 523,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-xs text-muted-foreground",
                                    children: "Active",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 524,
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
                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                              lineNumber: 522,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            v,
                            {
                              className: "p-3",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "text-2xl font-bold text-red-500",
                                    children: j.voided,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 527,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-xs text-muted-foreground",
                                    children: "Voided",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 528,
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
                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                              lineNumber: 526,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            v,
                            {
                              className: "p-3",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "text-2xl font-bold text-gray-500",
                                    children: j.expired,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 531,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-xs text-muted-foreground",
                                    children: "Expired",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 532,
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
                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                              lineNumber: 530,
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
                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                        lineNumber: 505,
                        columnNumber: 11,
                      },
                      this,
                    ),
                  e.jsxDEV(
                    We,
                    {
                      defaultValue: "my-contracts",
                      className: "space-y-4",
                      children: [
                        e.jsxDEV(
                          He,
                          {
                            children: [
                              e.jsxDEV(
                                ie,
                                {
                                  value: "my-contracts",
                                  children: "My Contracts",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                  lineNumber: 539,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                ie,
                                { value: "templates", children: "Templates" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                  lineNumber: 540,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                ie,
                                {
                                  value: "pending",
                                  children: [
                                    "Pending Signatures",
                                    j &&
                                      j.pendingSignature > 0 &&
                                      e.jsxDEV(
                                        B,
                                        {
                                          variant: "secondary",
                                          className: "ml-2",
                                          children: j.pendingSignature,
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
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
                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                  lineNumber: 541,
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
                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                            lineNumber: 538,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          ce,
                          {
                            value: "my-contracts",
                            className: "space-y-4",
                            children: [
                              e.jsxDEV(
                                "div",
                                {
                                  className: "flex items-center gap-3",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "flex items-center gap-2",
                                        children: [
                                          e.jsxDEV(
                                            gs,
                                            {
                                              className:
                                                "h-4 w-4 text-muted-foreground",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 552,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            Ds,
                                            {
                                              value: U,
                                              onValueChange: Y,
                                              children: [
                                                e.jsxDEV(
                                                  ks,
                                                  {
                                                    className: "w-[180px]",
                                                    children: e.jsxDEV(
                                                      Es,
                                                      {
                                                        placeholder:
                                                          "Filter by status",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                        lineNumber: 555,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                    lineNumber: 554,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  js,
                                                  {
                                                    children: [
                                                      e.jsxDEV(
                                                        $,
                                                        {
                                                          value: "all",
                                                          children:
                                                            "All Contracts",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                          lineNumber: 558,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        $,
                                                        {
                                                          value: "draft",
                                                          children: "Drafts",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                          lineNumber: 559,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        $,
                                                        {
                                                          value:
                                                            "pending_signature",
                                                          children: "Pending",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                          lineNumber: 560,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        $,
                                                        {
                                                          value:
                                                            "partially_signed",
                                                          children:
                                                            "Partially Signed",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                          lineNumber: 561,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        $,
                                                        {
                                                          value:
                                                            "fully_executed",
                                                          children: "Executed",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                          lineNumber: 562,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        $,
                                                        {
                                                          value: "voided",
                                                          children: "Voided",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                          lineNumber: 563,
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
                                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                    lineNumber: 557,
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
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 553,
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
                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                        lineNumber: 551,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "span",
                                      {
                                        className:
                                          "text-sm text-muted-foreground",
                                        children: [
                                          he.length,
                                          " contract",
                                          he.length !== 1 ? "s" : "",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                        lineNumber: 567,
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
                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                  lineNumber: 550,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              he.length === 0
                                ? e.jsxDEV(
                                    v,
                                    {
                                      className: "p-8 text-center",
                                      children: [
                                        e.jsxDEV(
                                          C,
                                          {
                                            className:
                                              "h-12 w-12 text-muted-foreground mx-auto mb-4",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                            lineNumber: 574,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "h3",
                                          {
                                            className: "font-medium",
                                            children: "No contracts yet",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                            lineNumber: 575,
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
                                              "Create your first contract using one of our templates",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                            lineNumber: 576,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          x,
                                          {
                                            className: "mt-4",
                                            onClick: () => b(!0),
                                            children: [
                                              e.jsxDEV(
                                                ke,
                                                { className: "h-4 w-4 mr-2" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                  lineNumber: 580,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              "Create Contract",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                            lineNumber: 579,
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
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 573,
                                      columnNumber: 15,
                                    },
                                    this,
                                  )
                                : e.jsxDEV(
                                    "div",
                                    {
                                      className: "grid gap-4",
                                      children: he.map((s) =>
                                        e.jsxDEV(
                                          v,
                                          {
                                            children: [
                                              e.jsxDEV(
                                                L,
                                                {
                                                  className: "pb-3",
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center justify-between",
                                                        children: [
                                                          e.jsxDEV(
                                                            M,
                                                            {
                                                              className:
                                                                "text-lg",
                                                              children: s.title,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                              lineNumber: 590,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          qe(s.status),
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                        lineNumber: 589,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      xe,
                                                      {
                                                        children: [
                                                          "Created ",
                                                          s.createdAt
                                                            ? fe(
                                                                new Date(
                                                                  s.createdAt,
                                                                ),
                                                                "MMM d, yyyy",
                                                              )
                                                            : "—",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                        lineNumber: 593,
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
                                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                  lineNumber: 588,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                ne,
                                                {
                                                  className: "pb-3",
                                                  children: e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex items-center gap-4 text-sm",
                                                      children: [
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "flex items-center gap-1",
                                                            children: [
                                                              e.jsxDEV(
                                                                oe,
                                                                {
                                                                  className:
                                                                    "h-4 w-4 text-muted-foreground",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                  lineNumber: 600,
                                                                  columnNumber: 27,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "span",
                                                                {
                                                                  children: [
                                                                    s.parties
                                                                      .length,
                                                                    " parties",
                                                                  ],
                                                                },
                                                                void 0,
                                                                !0,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                  lineNumber: 601,
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
                                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                            lineNumber: 599,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "flex items-center gap-1",
                                                            children: [
                                                              e.jsxDEV(
                                                                E,
                                                                {
                                                                  className:
                                                                    "h-4 w-4 text-muted-foreground",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                  lineNumber: 604,
                                                                  columnNumber: 27,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "span",
                                                                {
                                                                  children: [
                                                                    s.signatures.filter(
                                                                      (r) =>
                                                                        r.signedAt,
                                                                    ).length,
                                                                    "/",
                                                                    s.signatures
                                                                      .length,
                                                                    " signed",
                                                                  ],
                                                                },
                                                                void 0,
                                                                !0,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                  lineNumber: 605,
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
                                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                            lineNumber: 603,
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
                                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                      lineNumber: 598,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                  lineNumber: 597,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                Ee,
                                                {
                                                  className: "gap-2 flex-wrap",
                                                  children: [
                                                    e.jsxDEV(
                                                      x,
                                                      {
                                                        variant: "outline",
                                                        size: "sm",
                                                        onClick: () => {
                                                          (O(s), k(!0));
                                                        },
                                                        children: [
                                                          e.jsxDEV(
                                                            Ye,
                                                            {
                                                              className:
                                                                "h-4 w-4 mr-1",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                              lineNumber: 620,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          "View",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                        lineNumber: 612,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      x,
                                                      {
                                                        variant: "outline",
                                                        size: "sm",
                                                        onClick: () => Fe(s.id),
                                                        children: [
                                                          e.jsxDEV(
                                                            Ie,
                                                            {
                                                              className:
                                                                "h-4 w-4 mr-1",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                              lineNumber: 628,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                          "PDF",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                        lineNumber: 623,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    s.status === "draft" &&
                                                      e.jsxDEV(
                                                        x,
                                                        {
                                                          size: "sm",
                                                          onClick: () =>
                                                            Ae.mutate(s.id),
                                                          disabled:
                                                            Ae.isPending,
                                                          children: [
                                                            e.jsxDEV(
                                                              je,
                                                              {
                                                                className:
                                                                  "h-4 w-4 mr-1",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                lineNumber: 637,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            ),
                                                            "Send for Signature",
                                                          ],
                                                        },
                                                        void 0,
                                                        !0,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                          lineNumber: 632,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                    (s.status ===
                                                      "pending_signature" ||
                                                      s.status ===
                                                        "partially_signed") &&
                                                      e.jsxDEV(
                                                        x,
                                                        {
                                                          size: "sm",
                                                          onClick: () => {
                                                            (O(s), P(!0));
                                                          },
                                                          children: [
                                                            e.jsxDEV(
                                                              K,
                                                              {
                                                                className:
                                                                  "h-4 w-4 mr-1",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                lineNumber: 649,
                                                                columnNumber: 27,
                                                              },
                                                              this,
                                                            ),
                                                            "Sign",
                                                          ],
                                                        },
                                                        void 0,
                                                        !0,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                          lineNumber: 642,
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
                                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                  lineNumber: 611,
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
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                            lineNumber: 587,
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
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 585,
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
                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                            lineNumber: 549,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          ce,
                          {
                            value: "templates",
                            className: "space-y-4",
                            children: e.jsxDEV(
                              ze,
                              {
                                templates: Le,
                                categories: Me,
                                onSelect: (s) => {
                                  (D(s), b(!0));
                                },
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                lineNumber: 661,
                                columnNumber: 13,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                            lineNumber: 660,
                            columnNumber: 11,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          ce,
                          {
                            value: "pending",
                            className: "space-y-4",
                            children:
                              Ne.filter(
                                (s) =>
                                  s.status === "pending_signature" ||
                                  s.status === "partially_signed",
                              ).length === 0
                                ? e.jsxDEV(
                                    v,
                                    {
                                      className: "p-8 text-center",
                                      children: [
                                        e.jsxDEV(
                                          z,
                                          {
                                            className:
                                              "h-12 w-12 text-muted-foreground mx-auto mb-4",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                            lineNumber: 674,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "h3",
                                          {
                                            className: "font-medium",
                                            children: "No pending signatures",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                            lineNumber: 675,
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
                                              "All your contracts are up to date",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                            lineNumber: 676,
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
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 673,
                                      columnNumber: 15,
                                    },
                                    this,
                                  )
                                : e.jsxDEV(
                                    "div",
                                    {
                                      className: "grid gap-4",
                                      children: Ne.filter(
                                        (s) =>
                                          s.status === "pending_signature" ||
                                          s.status === "partially_signed",
                                      ).map((s) =>
                                        e.jsxDEV(
                                          v,
                                          {
                                            children: [
                                              e.jsxDEV(
                                                L,
                                                {
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center justify-between",
                                                        children: [
                                                          e.jsxDEV(
                                                            M,
                                                            {
                                                              className:
                                                                "text-lg",
                                                              children: s.title,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                              lineNumber: 688,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          qe(s.status),
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                        lineNumber: 687,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      xe,
                                                      {
                                                        children:
                                                          "Waiting for signatures",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                        lineNumber: 691,
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
                                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                  lineNumber: 686,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                ne,
                                                {
                                                  children: e.jsxDEV(
                                                    "div",
                                                    {
                                                      className: "space-y-2",
                                                      children: [
                                                        s.signatures
                                                          .filter(
                                                            (r) => !r.signedAt,
                                                          )
                                                          .map((r, n) =>
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "flex items-center gap-2 text-sm",
                                                                children: [
                                                                  e.jsxDEV(
                                                                    z,
                                                                    {
                                                                      className:
                                                                        "h-4 w-4 text-amber-500",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                      lineNumber: 699,
                                                                      columnNumber: 31,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "span",
                                                                    {
                                                                      children:
                                                                        r.partyName,
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                      lineNumber: 700,
                                                                      columnNumber: 31,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "span",
                                                                    {
                                                                      className:
                                                                        "text-muted-foreground",
                                                                      children:
                                                                        "(pending)",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                      lineNumber: 701,
                                                                      columnNumber: 31,
                                                                    },
                                                                    this,
                                                                  ),
                                                                ],
                                                              },
                                                              n,
                                                              !0,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                lineNumber: 698,
                                                                columnNumber: 29,
                                                              },
                                                              this,
                                                            ),
                                                          ),
                                                        s.signatures
                                                          .filter(
                                                            (r) => r.signedAt,
                                                          )
                                                          .map((r, n) =>
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "flex items-center gap-2 text-sm",
                                                                children: [
                                                                  e.jsxDEV(
                                                                    E,
                                                                    {
                                                                      className:
                                                                        "h-4 w-4 text-green-500",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                      lineNumber: 706,
                                                                      columnNumber: 31,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "span",
                                                                    {
                                                                      children:
                                                                        r.partyName,
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                      lineNumber: 707,
                                                                      columnNumber: 31,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "span",
                                                                    {
                                                                      className:
                                                                        "text-muted-foreground",
                                                                      children:
                                                                        [
                                                                          "(signed ",
                                                                          r.signedAt
                                                                            ? fe(
                                                                                new Date(
                                                                                  r.signedAt,
                                                                                ),
                                                                                "MMM d",
                                                                              )
                                                                            : "—",
                                                                          ")",
                                                                        ],
                                                                    },
                                                                    void 0,
                                                                    !0,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                      lineNumber: 708,
                                                                      columnNumber: 31,
                                                                    },
                                                                    this,
                                                                  ),
                                                                ],
                                                              },
                                                              n,
                                                              !0,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                                lineNumber: 705,
                                                                columnNumber: 29,
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
                                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                      lineNumber: 696,
                                                      columnNumber: 25,
                                                    },
                                                    this,
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                  lineNumber: 695,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                Ee,
                                                {
                                                  className: "gap-2",
                                                  children: [
                                                    e.jsxDEV(
                                                      x,
                                                      {
                                                        size: "sm",
                                                        onClick: () => {
                                                          (O(s), P(!0));
                                                        },
                                                        children: [
                                                          e.jsxDEV(
                                                            K,
                                                            {
                                                              className:
                                                                "h-4 w-4 mr-1",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                              lineNumber: 723,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          "Sign Now",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                        lineNumber: 716,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      x,
                                                      {
                                                        variant: "outline",
                                                        size: "sm",
                                                        onClick: () => {
                                                          (O(s), y(!0));
                                                        },
                                                        children: [
                                                          e.jsxDEV(
                                                            le,
                                                            {
                                                              className:
                                                                "h-4 w-4 mr-1",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                              lineNumber: 734,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          "Decline",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                        lineNumber: 726,
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
                                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                  lineNumber: 715,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                            ],
                                          },
                                          s.id,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                            lineNumber: 685,
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
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 681,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                            lineNumber: 671,
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
                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                      lineNumber: 537,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    G,
                    {
                      open: l,
                      onOpenChange: k,
                      children: e.jsxDEV(
                        ee,
                        {
                          className: "max-w-4xl max-h-[90vh]",
                          children: [
                            e.jsxDEV(
                              se,
                              {
                                children: [
                                  e.jsxDEV(
                                    re,
                                    { children: m?.title },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 748,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    te,
                                    {
                                      children:
                                        "Contract details and signature status",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 749,
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
                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                lineNumber: 747,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            m &&
                              e.jsxDEV(
                                "div",
                                {
                                  className: "grid md:grid-cols-2 gap-6",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "space-y-4",
                                        children: [
                                          e.jsxDEV(
                                            v,
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  L,
                                                  {
                                                    className: "pb-2",
                                                    children: e.jsxDEV(
                                                      M,
                                                      {
                                                        className: "text-sm",
                                                        children:
                                                          "Contract Preview",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                        lineNumber: 759,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                    lineNumber: 758,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  ne,
                                                  {
                                                    children: e.jsxDEV(
                                                      ae,
                                                      {
                                                        className:
                                                          "h-[300px] w-full rounded border p-4",
                                                        children: e.jsxDEV(
                                                          "pre",
                                                          {
                                                            className:
                                                              "text-xs whitespace-pre-wrap font-mono",
                                                            children: m.content,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                            lineNumber: 763,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                        lineNumber: 762,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                    lineNumber: 761,
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
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 757,
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
                                                  x,
                                                  {
                                                    variant: "outline",
                                                    className: "flex-1",
                                                    onClick: () => Fe(m.id),
                                                    children: [
                                                      e.jsxDEV(
                                                        Ie,
                                                        {
                                                          className:
                                                            "h-4 w-4 mr-2",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                          lineNumber: 776,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      "Download PDF",
                                                    ],
                                                  },
                                                  void 0,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                    lineNumber: 771,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                m.status !== "fully_executed" &&
                                                  m.status !== "voided" &&
                                                  e.jsxDEV(
                                                    x,
                                                    {
                                                      variant: "destructive",
                                                      className: "flex-1",
                                                      onClick: () =>
                                                        is.mutate(m.id),
                                                      children: [
                                                        e.jsxDEV(
                                                          Ue,
                                                          {
                                                            className:
                                                              "h-4 w-4 mr-2",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                            lineNumber: 785,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        "Void Contract",
                                                      ],
                                                    },
                                                    void 0,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                      lineNumber: 780,
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
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 770,
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
                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                        lineNumber: 756,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: e.jsxDEV(
                                          Ps,
                                          {
                                            signers:
                                              as?.signers.map((s) => ({
                                                ...s,
                                                status: s.status,
                                              })) ||
                                              m.parties.map((s) => {
                                                const r = m.signatures.find(
                                                  (n) => n.partyName === s.name,
                                                );
                                                return {
                                                  name: s.name,
                                                  role: s.role,
                                                  status: r?.signedAt
                                                    ? "signed"
                                                    : "pending",
                                                  signedAt: r?.signedAt,
                                                };
                                              }),
                                            timeline: ns?.timeline || [],
                                            showTimeline: !0,
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
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
                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                        lineNumber: 792,
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
                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                  lineNumber: 755,
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
                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                          lineNumber: 746,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                      lineNumber: 745,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    G,
                    {
                      open: w,
                      onOpenChange: c,
                      children: e.jsxDEV(
                        ee,
                        {
                          className: "max-w-3xl max-h-[90vh]",
                          children: [
                            e.jsxDEV(
                              se,
                              {
                                children: [
                                  e.jsxDEV(
                                    re,
                                    { children: "Contract Preview" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 818,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    te,
                                    {
                                      children:
                                        "Review the contract content before creating",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 819,
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
                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                lineNumber: 817,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              ae,
                              {
                                className:
                                  "h-[500px] w-full rounded border p-4",
                                children: e.jsxDEV(
                                  "pre",
                                  {
                                    className:
                                      "text-sm whitespace-pre-wrap font-mono",
                                    children: be,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 824,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                lineNumber: 823,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              De,
                              {
                                children: e.jsxDEV(
                                  x,
                                  {
                                    variant: "outline",
                                    onClick: () => c(!1),
                                    children: "Close",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 829,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                lineNumber: 828,
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
                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                          lineNumber: 816,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                      lineNumber: 815,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    G,
                    {
                      open: V,
                      onOpenChange: (s) => {
                        (P(s), s || (H("pick"), de("")));
                      },
                      children: e.jsxDEV(
                        ee,
                        {
                          className: "max-w-lg",
                          children: [
                            e.jsxDEV(
                              se,
                              {
                                children: [
                                  e.jsxDEV(
                                    re,
                                    {
                                      className: "flex items-center gap-2",
                                      children: [
                                        e.jsxDEV(
                                          K,
                                          { className: "h-5 w-5 text-primary" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                            lineNumber: 838,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        T === "pick"
                                          ? "Sign Contract"
                                          : "Draw Your Signature",
                                      ],
                                    },
                                    void 0,
                                    !0,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 837,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    te,
                                    {
                                      children:
                                        T === "pick"
                                          ? "Select which party you are signing as."
                                          : "Draw your signature in the box below using your mouse or finger.",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 841,
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
                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                lineNumber: 836,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            m &&
                              T === "pick" &&
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-4",
                                  children: [
                                    e.jsxDEV(
                                      v,
                                      {
                                        className: "p-4 bg-muted/50",
                                        children: [
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className: "font-medium",
                                              children: m.title,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 851,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "text-sm text-muted-foreground mt-1",
                                              children: [
                                                m.parties.length,
                                                " ",
                                                m.parties.length === 1
                                                  ? "party"
                                                  : "parties",
                                                " involved",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 852,
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
                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                        lineNumber: 850,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "p",
                                      {
                                        className:
                                          "text-sm text-muted-foreground",
                                        children: "Who are you signing as?",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                        lineNumber: 856,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    m.signatures.filter((s) => !s.signedAt)
                                      .length > 0
                                      ? e.jsxDEV(
                                          "div",
                                          {
                                            className: "space-y-2",
                                            children: m.signatures
                                              .filter((s) => !s.signedAt)
                                              .map((s, r) =>
                                                e.jsxDEV(
                                                  x,
                                                  {
                                                    variant: "outline",
                                                    className:
                                                      "w-full justify-start h-12",
                                                    onClick: () => {
                                                      (de(s.partyName),
                                                        H("draw"));
                                                    },
                                                    children: [
                                                      e.jsxDEV(
                                                        oe,
                                                        {
                                                          className:
                                                            "h-4 w-4 mr-2 text-muted-foreground",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                          lineNumber: 866,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        "span",
                                                        {
                                                          className:
                                                            "font-medium",
                                                          children: s.partyName,
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                          lineNumber: 867,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                    ],
                                                  },
                                                  r,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                    lineNumber: 860,
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
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                            lineNumber: 858,
                                            columnNumber: 19,
                                          },
                                          this,
                                        )
                                      : e.jsxDEV(
                                          "div",
                                          {
                                            className: "space-y-2",
                                            children: [
                                              e.jsxDEV(
                                                "input",
                                                {
                                                  type: "text",
                                                  className:
                                                    "w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary",
                                                  placeholder:
                                                    "Enter your name or role (e.g. Artist, Producer)",
                                                  value: X,
                                                  onChange: (s) =>
                                                    de(s.target.value),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                  lineNumber: 873,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                x,
                                                {
                                                  className: "w-full",
                                                  disabled: !X.trim(),
                                                  onClick: () => H("draw"),
                                                  children:
                                                    "Continue to Signature",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                  lineNumber: 880,
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
                                              "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                            lineNumber: 872,
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
                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                  lineNumber: 849,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                            m &&
                              T === "draw" &&
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-4",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "text-sm text-center text-muted-foreground",
                                        children: [
                                          "Signing as: ",
                                          e.jsxDEV(
                                            "span",
                                            {
                                              className:
                                                "font-semibold text-foreground",
                                              children: X,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 895,
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
                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                        lineNumber: 894,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "relative rounded-lg border-2 border-dashed border-border bg-white overflow-hidden",
                                        children: [
                                          e.jsxDEV(
                                            "canvas",
                                            {
                                              ref: _,
                                              width: 460,
                                              height: 180,
                                              className:
                                                "w-full touch-none cursor-crosshair",
                                              onMouseDown: (s) =>
                                                Te(s.nativeEvent),
                                              onMouseMove: (s) =>
                                                Be(s.nativeEvent),
                                              onMouseUp: () => we(),
                                              onMouseLeave: () => we(),
                                              onTouchStart: (s) =>
                                                Te(s.nativeEvent),
                                              onTouchMove: (s) =>
                                                Be(s.nativeEvent),
                                              onTouchEnd: () => we(),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 898,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "p",
                                            {
                                              className:
                                                "absolute bottom-2 right-3 text-xs text-muted-foreground pointer-events-none select-none",
                                              children: "Sign here",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 911,
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
                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                        lineNumber: 897,
                                        columnNumber: 17,
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
                                            x,
                                            {
                                              type: "button",
                                              variant: "ghost",
                                              size: "sm",
                                              onClick: Ze,
                                              children: [
                                                e.jsxDEV(
                                                  vs,
                                                  {
                                                    className:
                                                      "h-3.5 w-3.5 mr-1.5",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                    lineNumber: 917,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                "Clear",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 916,
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
                                                  x,
                                                  {
                                                    variant: "outline",
                                                    size: "sm",
                                                    onClick: () => H("pick"),
                                                    children: "Back",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                    lineNumber: 921,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  x,
                                                  {
                                                    size: "sm",
                                                    onClick: es,
                                                    disabled: Ce.isPending,
                                                    children: Ce.isPending
                                                      ? "Signing..."
                                                      : "Submit Signature",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                                    lineNumber: 922,
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
                                                "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                              lineNumber: 920,
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
                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                        lineNumber: 915,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "p",
                                      {
                                        className:
                                          "text-xs text-center text-muted-foreground",
                                        children:
                                          "By submitting, you agree to all terms of this contract and confirm this is your legal signature.",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                        lineNumber: 931,
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
                                    "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                  lineNumber: 893,
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
                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                          lineNumber: 835,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                      lineNumber: 834,
                      columnNumber: 9,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    G,
                    {
                      open: Q,
                      onOpenChange: y,
                      children: e.jsxDEV(
                        ee,
                        {
                          children: [
                            e.jsxDEV(
                              se,
                              {
                                children: [
                                  e.jsxDEV(
                                    re,
                                    { children: "Decline Signature" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 942,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    te,
                                    {
                                      children:
                                        "Please provide a reason for declining to sign this contract.",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 943,
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
                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                lineNumber: 941,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "div",
                              {
                                className: "space-y-4",
                                children: e.jsxDEV(
                                  "div",
                                  {
                                    className: "space-y-2",
                                    children: [
                                      e.jsxDEV(
                                        I,
                                        {
                                          htmlFor: "decline-reason",
                                          children: "Reason",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                          lineNumber: 950,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        Je,
                                        {
                                          id: "decline-reason",
                                          value: J,
                                          onChange: (s) => t(s.target.value),
                                          placeholder:
                                            "Enter your reason for declining...",
                                          rows: 3,
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                          lineNumber: 951,
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
                                      "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                    lineNumber: 949,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                lineNumber: 948,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              De,
                              {
                                children: [
                                  e.jsxDEV(
                                    x,
                                    {
                                      variant: "outline",
                                      onClick: () => y(!1),
                                      children: "Cancel",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 962,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    x,
                                    {
                                      variant: "destructive",
                                      onClick: () => {
                                        if (m) {
                                          const s = m.signatures.find(
                                            (r) => !r.signedAt,
                                          );
                                          s &&
                                            Re.mutate({
                                              contractId: m.id,
                                              partyName: s.partyName,
                                              reason: J,
                                            });
                                        }
                                      },
                                      disabled: !J || Re.isPending,
                                      children: "Decline & Void Contract",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                      lineNumber: 965,
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
                                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                                lineNumber: 961,
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
                            "/home/runner/workspace/client/src/pages/Contracts.tsx",
                          lineNumber: 940,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Contracts.tsx",
                      lineNumber: 939,
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
                  "/home/runner/workspace/client/src/pages/Contracts.tsx",
                lineNumber: 439,
                columnNumber: 7,
              },
              this,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Contracts.tsx",
          lineNumber: 432,
          columnNumber: 5,
        },
        this,
      )
    : (d("/login"), null);
}
export { Qs as default };
