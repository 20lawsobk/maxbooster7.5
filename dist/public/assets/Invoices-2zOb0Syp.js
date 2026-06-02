import {
  ag as fe,
  ah as ge,
  r as N,
  aH as we,
  aI as $,
  f as e,
  dD as J,
  ai as q,
  aK as De,
  aX as Ie,
  bK as G,
  bg as O,
  d0 as I,
  ca as ke,
  bu as Ee,
  ao as X,
  b$ as je,
  a_ as Ve,
} from "./vendor-react-31oK5L0i.js";
import {
  u as ye,
  o as _,
  ae as Ce,
  j as l,
  p as W,
  r as Z,
  v as ee,
  w as Se,
  L as d,
  I as h,
  W as se,
  X as re,
  Y as ne,
  Z as ie,
  $ as p,
  y as Pe,
  ac as Te,
  C as v,
  d as k,
  g as E,
  f as j,
  a0 as Fe,
  a1 as Ae,
  a2 as Le,
  a3 as V,
  a7 as Me,
  H as Ue,
  K as $e,
  M as qe,
  N as Oe,
  O as Re,
  Q as Be,
  R as Qe,
  U as He,
  k as R,
  B as Ke,
} from "./studio-DOUfHW5v.js";
import { a as ze } from "./index-D5xLbTBZ.js";
import { A as Ye } from "./AppLayout-D2pri0rw.js";
import {
  T as ce,
  a as le,
  b,
  c as o,
  d as ae,
  e as a,
} from "./table-BLAeU9Q6.js";
import { af as B } from "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
import "./TopBar-jcH3P98k.js";
function is() {
  const { user: Q } = ze(),
    [, oe] = fe(),
    { toast: u } = ye(),
    y = ge(),
    [te, f] = N.useState(!1),
    [me, C] = N.useState(!1),
    [c, H] = N.useState(null),
    [S, ue] = N.useState("all"),
    [g, Ne] = N.useState(""),
    [P, T] = N.useState(null),
    F = {
      USD: { symbol: "$", label: "USD — US Dollar" },
      EUR: { symbol: "€", label: "EUR — Euro" },
      GBP: { symbol: "£", label: "GBP — British Pound" },
      CAD: { symbol: "C$", label: "CAD — Canadian Dollar" },
      AUD: { symbol: "A$", label: "AUD — Australian Dollar" },
      JPY: { symbol: "¥", label: "JPY — Japanese Yen" },
    },
    [n, t] = N.useState({
      clientName: "",
      clientEmail: "",
      currency: "USD",
      dueDate: "",
      items: [{ description: "", quantity: 1, unitPrice: 0 }],
      notes: "",
    }),
    { data: he, isLoading: de } = we({
      queryKey: ["/api/invoices"],
      enabled: !!Q,
    }),
    A = $({
      mutationFn: async () => {
        const s = R(),
          r = await fetch("/api/invoices", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(s ? { "x-csrf-token": s } : {}),
            },
            credentials: "include",
            body: JSON.stringify(n),
          });
        if (!r.ok) throw new Error("Failed to create invoice");
        return r.json();
      },
      onSuccess: () => {
        (y.invalidateQueries({ queryKey: ["/api/invoices"] }),
          f(!1),
          t({
            clientName: "",
            clientEmail: "",
            currency: "USD",
            dueDate: "",
            items: [{ description: "", quantity: 1, unitPrice: 0 }],
            notes: "",
          }),
          u({
            title: "Invoice created",
            description: "Your invoice has been saved as a draft.",
          }));
      },
      onError: (s) => {
        u({ title: "Error", description: s.message, variant: "destructive" });
      },
    }),
    w = $({
      mutationFn: async (s) => {
        const r = R(),
          i = await fetch(`/api/invoices/${s}/send`, {
            method: "POST",
            credentials: "include",
            headers: r ? { "x-csrf-token": r } : {},
          });
        if (!i.ok) throw new Error("Failed to send invoice");
        return i.json();
      },
      onSuccess: () => {
        (y.invalidateQueries({ queryKey: ["/api/invoices"] }),
          u({
            title: "Invoice sent",
            description: "The invoice has been emailed to the client.",
          }));
      },
      onError: (s) => {
        u({ title: "Error", description: s.message, variant: "destructive" });
      },
    }),
    pe = $({
      mutationFn: async (s) => {
        const r = R();
        if (
          !(
            await fetch(`/api/invoices/${s}`, {
              method: "DELETE",
              credentials: "include",
              headers: r ? { "x-csrf-token": r } : {},
            })
          ).ok
        )
          throw new Error("Failed to delete invoice");
      },
      onSuccess: () => {
        (y.invalidateQueries({ queryKey: ["/api/invoices"] }),
          u({ title: "Invoice deleted" }));
      },
      onError: (s) => {
        u({ title: "Error", description: s.message, variant: "destructive" });
      },
    }),
    L = async (s, r) => {
      try {
        const i = await fetch(`/api/invoices/${s}/pdf`, {
          credentials: "include",
        });
        if (!i.ok) throw new Error("Failed to generate PDF");
        const m = await i.blob(),
          Y = URL.createObjectURL(m),
          U = document.createElement("a");
        ((U.href = Y),
          (U.download = `${r}.pdf`),
          U.click(),
          URL.revokeObjectURL(Y));
      } catch {
        u({
          title: "Download failed",
          description: "Could not generate PDF. Please try again.",
          variant: "destructive",
        });
      }
    };
  if (!Q) return (oe("/login"), null);
  const x = he?.invoices || [],
    K = x.filter((s) => {
      const r = S === "all" || s.status === S,
        i =
          !g ||
          s.clientName.toLowerCase().includes(g.toLowerCase()) ||
          s.invoiceNumber.toLowerCase().includes(g.toLowerCase());
      return r && i;
    }),
    D = {
      total: x.reduce((s, r) => s + r.amount, 0),
      paid: x
        .filter((s) => s.status === "paid")
        .reduce((s, r) => s + r.amount, 0),
      pending: x
        .filter((s) => s.status === "sent")
        .reduce((s, r) => s + r.amount, 0),
      overdue: x
        .filter((s) => s.status === "overdue")
        .reduce((s, r) => s + r.amount, 0),
    },
    z = (s) => {
      const r = {
          draft: {
            variant: "outline",
            icon: e.jsxDEV(
              Ve,
              { className: "h-3 w-3" },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                lineNumber: 201,
                columnNumber: 42,
              },
              this,
            ),
          },
          sent: {
            variant: "secondary",
            icon: e.jsxDEV(
              I,
              { className: "h-3 w-3" },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                lineNumber: 202,
                columnNumber: 43,
              },
              this,
            ),
          },
          paid: {
            variant: "default",
            icon: e.jsxDEV(
              je,
              { className: "h-3 w-3" },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                lineNumber: 203,
                columnNumber: 41,
              },
              this,
            ),
          },
          overdue: {
            variant: "destructive",
            icon: e.jsxDEV(
              X,
              { className: "h-3 w-3" },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                lineNumber: 204,
                columnNumber: 48,
              },
              this,
            ),
          },
          cancelled: {
            variant: "outline",
            icon: e.jsxDEV(
              X,
              { className: "h-3 w-3" },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                lineNumber: 205,
                columnNumber: 46,
              },
              this,
            ),
          },
        },
        { variant: i, icon: m } = r[s] || r.draft;
      return e.jsxDEV(
        Ke,
        {
          variant: i,
          className: "flex items-center gap-1",
          children: [m, s.charAt(0).toUpperCase() + s.slice(1)],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/pages/Invoices.tsx",
          lineNumber: 209,
          columnNumber: 7,
        },
        this,
      );
    },
    ve = () => {
      t({
        ...n,
        items: [...n.items, { description: "", quantity: 1, unitPrice: 0 }],
      });
    },
    M = (s, r, i) => {
      const m = [...n.items];
      ((m[s] = { ...m[s], [r]: i }), t({ ...n, items: m }));
    },
    xe = (s) => {
      if (n.items.length > 1) {
        const r = n.items.filter((i, m) => m !== s);
        t({ ...n, items: r });
      }
    },
    be = () => n.items.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
  return e.jsxDEV(
    Ye,
    {
      children: de
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
                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                  lineNumber: 244,
                  columnNumber: 11,
                },
                this,
              ),
            },
            void 0,
            !1,
            {
              fileName: "/home/runner/workspace/client/src/pages/Invoices.tsx",
              lineNumber: 243,
              columnNumber: 9,
            },
            this,
          )
        : e.jsxDEV(
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
                                    J,
                                    { className: "h-8 w-8 text-primary" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                      lineNumber: 251,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  "Invoices",
                                ],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                lineNumber: 250,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "p",
                              {
                                className: "text-muted-foreground mt-1",
                                children:
                                  "Create and manage invoices for your music services",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                lineNumber: 254,
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
                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                          lineNumber: 249,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        _,
                        {
                          open: te,
                          onOpenChange: f,
                          children: [
                            e.jsxDEV(
                              Ce,
                              {
                                asChild: !0,
                                children: e.jsxDEV(
                                  l,
                                  {
                                    children: [
                                      e.jsxDEV(
                                        q,
                                        { className: "h-4 w-4 mr-2" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                          lineNumber: 261,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                      "New Invoice",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 260,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                lineNumber: 259,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              W,
                              {
                                className:
                                  "max-w-2xl max-h-[90vh] overflow-y-auto",
                                children: [
                                  e.jsxDEV(
                                    Z,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          ee,
                                          { children: "Create Invoice" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 267,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          Se,
                                          {
                                            children:
                                              "Create a new invoice for your client",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 268,
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
                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                      lineNumber: 266,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    "div",
                                    {
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
                                                      d,
                                                      {
                                                        htmlFor: "clientName",
                                                        children: "Client Name",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 276,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      h,
                                                      {
                                                        id: "clientName",
                                                        value: n.clientName,
                                                        onChange: (s) =>
                                                          t({
                                                            ...n,
                                                            clientName:
                                                              s.target.value,
                                                          }),
                                                        placeholder:
                                                          "Client or company name",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 277,
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
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 275,
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
                                                      d,
                                                      {
                                                        htmlFor: "clientEmail",
                                                        children:
                                                          "Client Email",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 285,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      h,
                                                      {
                                                        id: "clientEmail",
                                                        type: "email",
                                                        value: n.clientEmail,
                                                        onChange: (s) =>
                                                          t({
                                                            ...n,
                                                            clientEmail:
                                                              s.target.value,
                                                          }),
                                                        placeholder:
                                                          "client@example.com",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 286,
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
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 284,
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
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 274,
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
                                                      d,
                                                      {
                                                        htmlFor: "dueDate",
                                                        children: "Due Date",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 298,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      h,
                                                      {
                                                        id: "dueDate",
                                                        type: "date",
                                                        value: n.dueDate,
                                                        onChange: (s) =>
                                                          t({
                                                            ...n,
                                                            dueDate:
                                                              s.target.value,
                                                          }),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 299,
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
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 297,
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
                                                      d,
                                                      {
                                                        htmlFor: "currency",
                                                        children: "Currency",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 307,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      se,
                                                      {
                                                        value: n.currency,
                                                        onValueChange: (s) =>
                                                          t({
                                                            ...n,
                                                            currency: s,
                                                          }),
                                                        children: [
                                                          e.jsxDEV(
                                                            re,
                                                            {
                                                              id: "currency",
                                                              children:
                                                                e.jsxDEV(
                                                                  ne,
                                                                  {},
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                    lineNumber: 310,
                                                                    columnNumber: 25,
                                                                  },
                                                                  this,
                                                                ),
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                              lineNumber: 309,
                                                              columnNumber: 23,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            ie,
                                                            {
                                                              children:
                                                                Object.entries(
                                                                  F,
                                                                ).map(
                                                                  ([
                                                                    s,
                                                                    {
                                                                      label: r,
                                                                    },
                                                                  ]) =>
                                                                    e.jsxDEV(
                                                                      p,
                                                                      {
                                                                        value:
                                                                          s,
                                                                        children:
                                                                          r,
                                                                      },
                                                                      s,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                        lineNumber: 314,
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
                                                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                              lineNumber: 312,
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
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 308,
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
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 306,
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
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 296,
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
                                                "div",
                                                {
                                                  className:
                                                    "flex items-center justify-between",
                                                  children: [
                                                    e.jsxDEV(
                                                      d,
                                                      {
                                                        children: "Line Items",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 323,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      l,
                                                      {
                                                        type: "button",
                                                        variant: "outline",
                                                        size: "sm",
                                                        onClick: ve,
                                                        children: [
                                                          e.jsxDEV(
                                                            q,
                                                            {
                                                              className:
                                                                "h-4 w-4 mr-1",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                              lineNumber: 325,
                                                              columnNumber: 23,
                                                            },
                                                            this,
                                                          ),
                                                          "Add Item",
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 324,
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
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 322,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className: "space-y-3",
                                                  children: n.items.map(
                                                    (s, r) =>
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "grid grid-cols-12 gap-2 items-end",
                                                          children: [
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "col-span-6",
                                                                children:
                                                                  e.jsxDEV(
                                                                    h,
                                                                    {
                                                                      placeholder:
                                                                        "Description",
                                                                      value:
                                                                        s.description,
                                                                      onChange:
                                                                        (i) =>
                                                                          M(
                                                                            r,
                                                                            "description",
                                                                            i
                                                                              .target
                                                                              .value,
                                                                          ),
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                      lineNumber: 334,
                                                                      columnNumber: 27,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                lineNumber: 333,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "col-span-2",
                                                                children:
                                                                  e.jsxDEV(
                                                                    h,
                                                                    {
                                                                      type: "number",
                                                                      placeholder:
                                                                        "Qty",
                                                                      min: "1",
                                                                      value:
                                                                        s.quantity,
                                                                      onChange:
                                                                        (i) =>
                                                                          M(
                                                                            r,
                                                                            "quantity",
                                                                            parseInt(
                                                                              i
                                                                                .target
                                                                                .value,
                                                                            ) ||
                                                                              1,
                                                                          ),
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
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
                                                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                lineNumber: 340,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "col-span-3",
                                                                children:
                                                                  e.jsxDEV(
                                                                    h,
                                                                    {
                                                                      type: "number",
                                                                      placeholder:
                                                                        "Price",
                                                                      min: "0",
                                                                      step: "0.01",
                                                                      value:
                                                                        s.unitPrice,
                                                                      onChange:
                                                                        (i) =>
                                                                          M(
                                                                            r,
                                                                            "unitPrice",
                                                                            parseFloat(
                                                                              i
                                                                                .target
                                                                                .value,
                                                                            ) ||
                                                                              0,
                                                                          ),
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                      lineNumber: 350,
                                                                      columnNumber: 27,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                lineNumber: 349,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                className:
                                                                  "col-span-1",
                                                                children:
                                                                  e.jsxDEV(
                                                                    l,
                                                                    {
                                                                      type: "button",
                                                                      variant:
                                                                        "ghost",
                                                                      size: "sm",
                                                                      onClick:
                                                                        () =>
                                                                          xe(r),
                                                                      disabled:
                                                                        n.items
                                                                          .length ===
                                                                        1,
                                                                      children:
                                                                        "×",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                      lineNumber: 360,
                                                                      columnNumber: 27,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                lineNumber: 359,
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
                                                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                          lineNumber: 332,
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
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 330,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "flex justify-end pt-2 border-t",
                                                  children: e.jsxDEV(
                                                    "div",
                                                    {
                                                      className: "text-right",
                                                      children: [
                                                        e.jsxDEV(
                                                          "p",
                                                          {
                                                            className:
                                                              "text-sm text-muted-foreground",
                                                            children: [
                                                              "Total (",
                                                              n.currency,
                                                              ")",
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                            lineNumber: 376,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "p",
                                                          {
                                                            className:
                                                              "text-xl font-bold",
                                                            children: [
                                                              F[n.currency]
                                                                ?.symbol,
                                                              be().toFixed(2),
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                            lineNumber: 377,
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
                                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                      lineNumber: 375,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 374,
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
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 321,
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
                                                d,
                                                {
                                                  htmlFor: "notes",
                                                  children: "Notes (optional)",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 383,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                Pe,
                                                {
                                                  id: "notes",
                                                  value: n.notes,
                                                  onChange: (s) =>
                                                    t({
                                                      ...n,
                                                      notes: s.target.value,
                                                    }),
                                                  placeholder:
                                                    "Additional notes or payment terms...",
                                                  rows: 3,
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 384,
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
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 382,
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
                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                      lineNumber: 273,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    Te,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          l,
                                          {
                                            variant: "outline",
                                            onClick: () => f(!1),
                                            children: "Cancel",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 395,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          l,
                                          {
                                            onClick: () => A.mutate(),
                                            disabled:
                                              !n.clientName ||
                                              !n.clientEmail ||
                                              A.isPending,
                                            children: A.isPending
                                              ? "Creating..."
                                              : "Create Invoice",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 396,
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
                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                      lineNumber: 394,
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
                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                lineNumber: 265,
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
                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                          lineNumber: 258,
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
                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                    lineNumber: 248,
                    columnNumber: 9,
                  },
                  this,
                ),
                e.jsxDEV(
                  "div",
                  {
                    className: "grid md:grid-cols-4 gap-4",
                    children: [
                      e.jsxDEV(
                        v,
                        {
                          children: e.jsxDEV(
                            k,
                            {
                              className: "pb-2",
                              children: [
                                e.jsxDEV(
                                  E,
                                  { children: "Total Invoiced" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 410,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  j,
                                  {
                                    className: "text-2xl",
                                    children: ["$", D.total.toLocaleString()],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 411,
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
                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                              lineNumber: 409,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                          lineNumber: 408,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        v,
                        {
                          children: e.jsxDEV(
                            k,
                            {
                              className: "pb-2",
                              children: [
                                e.jsxDEV(
                                  E,
                                  { children: "Paid" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 416,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  j,
                                  {
                                    className: "text-2xl text-green-500",
                                    children: ["$", D.paid.toLocaleString()],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 417,
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
                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                              lineNumber: 415,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                          lineNumber: 414,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        v,
                        {
                          children: e.jsxDEV(
                            k,
                            {
                              className: "pb-2",
                              children: [
                                e.jsxDEV(
                                  E,
                                  { children: "Pending" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 422,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  j,
                                  {
                                    className: "text-2xl text-amber-500",
                                    children: ["$", D.pending.toLocaleString()],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 423,
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
                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                              lineNumber: 421,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                          lineNumber: 420,
                          columnNumber: 11,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        v,
                        {
                          children: e.jsxDEV(
                            k,
                            {
                              className: "pb-2",
                              children: [
                                e.jsxDEV(
                                  E,
                                  { children: "Overdue" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 428,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  j,
                                  {
                                    className: "text-2xl text-red-500",
                                    children: ["$", D.overdue.toLocaleString()],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 429,
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
                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                              lineNumber: 427,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                          lineNumber: 426,
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
                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                    lineNumber: 407,
                    columnNumber: 9,
                  },
                  this,
                ),
                e.jsxDEV(
                  "div",
                  {
                    className: "flex items-center gap-4",
                    children: [
                      e.jsxDEV(
                        "div",
                        {
                          className: "relative flex-1 max-w-sm",
                          children: [
                            e.jsxDEV(
                              De,
                              {
                                className:
                                  "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                lineNumber: 436,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              h,
                              {
                                placeholder: "Search invoices...",
                                value: g,
                                onChange: (s) => Ne(s.target.value),
                                className: "pl-10",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                lineNumber: 437,
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
                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                          lineNumber: 435,
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
                              Ie,
                              { className: "h-4 w-4 text-muted-foreground" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                lineNumber: 445,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              se,
                              {
                                value: S,
                                onValueChange: ue,
                                children: [
                                  e.jsxDEV(
                                    re,
                                    {
                                      className: "w-[150px]",
                                      children: e.jsxDEV(
                                        ne,
                                        { placeholder: "Filter" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                          lineNumber: 448,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                      lineNumber: 447,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    ie,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          p,
                                          { value: "all", children: "All" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 451,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          p,
                                          { value: "draft", children: "Draft" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 452,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          p,
                                          { value: "sent", children: "Sent" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 453,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          p,
                                          { value: "paid", children: "Paid" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 454,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          p,
                                          {
                                            value: "overdue",
                                            children: "Overdue",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 455,
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
                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                      lineNumber: 450,
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
                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
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
                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                          lineNumber: 444,
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
                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                    lineNumber: 434,
                    columnNumber: 9,
                  },
                  this,
                ),
                K.length === 0
                  ? e.jsxDEV(
                      v,
                      {
                        className: "p-12 text-center",
                        children: [
                          e.jsxDEV(
                            J,
                            {
                              className:
                                "h-16 w-16 text-muted-foreground mx-auto mb-4",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                              lineNumber: 463,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "h3",
                            {
                              className: "text-xl font-medium",
                              children: "No invoices yet",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                              lineNumber: 464,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "p",
                            {
                              className:
                                "text-muted-foreground mt-2 max-w-md mx-auto",
                              children:
                                "Create your first invoice to start tracking payments for your music services",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                              lineNumber: 465,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            l,
                            {
                              className: "mt-6",
                              onClick: () => f(!0),
                              children: [
                                e.jsxDEV(
                                  q,
                                  { className: "h-4 w-4 mr-2" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 469,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                "Create Your First Invoice",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                              lineNumber: 468,
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
                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                        lineNumber: 462,
                        columnNumber: 11,
                      },
                      this,
                    )
                  : e.jsxDEV(
                      v,
                      {
                        children: e.jsxDEV(
                          ce,
                          {
                            children: [
                              e.jsxDEV(
                                le,
                                {
                                  children: e.jsxDEV(
                                    b,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          o,
                                          { children: "Invoice #" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 478,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          o,
                                          { children: "Client" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 479,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          o,
                                          { children: "Amount" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 480,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          o,
                                          { children: "Status" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 481,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          o,
                                          { children: "Due Date" },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 482,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          o,
                                          {
                                            className: "text-right",
                                            children: "Actions",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 483,
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
                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                      lineNumber: 477,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                  lineNumber: 476,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                ae,
                                {
                                  children: K.map((s) =>
                                    e.jsxDEV(
                                      b,
                                      {
                                        children: [
                                          e.jsxDEV(
                                            a,
                                            {
                                              className: "font-medium",
                                              children: s.invoiceNumber,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                              lineNumber: 489,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            a,
                                            {
                                              children: e.jsxDEV(
                                                "div",
                                                {
                                                  children: [
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className:
                                                          "font-medium",
                                                        children: s.clientName,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 492,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "p",
                                                      {
                                                        className:
                                                          "text-sm text-muted-foreground",
                                                        children: s.clientEmail,
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 493,
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
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 491,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                              lineNumber: 490,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            a,
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  "span",
                                                  {
                                                    className: "font-medium",
                                                    children: [
                                                      F[s.currency]?.symbol ??
                                                        "$",
                                                      s.amount.toLocaleString(),
                                                    ],
                                                  },
                                                  void 0,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                    lineNumber: 497,
                                                    columnNumber: 23,
                                                  },
                                                  this,
                                                ),
                                                s.currency &&
                                                  s.currency !== "USD" &&
                                                  e.jsxDEV(
                                                    "span",
                                                    {
                                                      className:
                                                        "text-xs text-muted-foreground ml-1",
                                                      children: s.currency,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                      lineNumber: 501,
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
                                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                              lineNumber: 496,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            a,
                                            { children: z(s.status) },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                              lineNumber: 504,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            a,
                                            {
                                              children: B(
                                                new Date(s.dueDate),
                                                "MMM d, yyyy",
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                              lineNumber: 505,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            a,
                                            {
                                              className: "text-right",
                                              children: e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "flex justify-end gap-1",
                                                  children: [
                                                    e.jsxDEV(
                                                      l,
                                                      {
                                                        variant: "ghost",
                                                        size: "icon",
                                                        className: "h-8 w-8",
                                                        onClick: () => {
                                                          (H(s), C(!0));
                                                        },
                                                        children: e.jsxDEV(
                                                          G,
                                                          {
                                                            className:
                                                              "h-4 w-4",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                            lineNumber: 517,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 508,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      l,
                                                      {
                                                        variant: "ghost",
                                                        size: "icon",
                                                        className: "h-8 w-8",
                                                        onClick: () =>
                                                          L(
                                                            s.id,
                                                            s.invoiceNumber,
                                                          ),
                                                        children: e.jsxDEV(
                                                          O,
                                                          {
                                                            className:
                                                              "h-4 w-4",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                            lineNumber: 520,
                                                            columnNumber: 27,
                                                          },
                                                          this,
                                                        ),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 519,
                                                        columnNumber: 25,
                                                      },
                                                      this,
                                                    ),
                                                    s.status === "draft" &&
                                                      e.jsxDEV(
                                                        l,
                                                        {
                                                          size: "sm",
                                                          className: "h-8",
                                                          onClick: () =>
                                                            w.mutate(s.id),
                                                          disabled: w.isPending,
                                                          children: [
                                                            e.jsxDEV(
                                                              I,
                                                              {
                                                                className:
                                                                  "h-3.5 w-3.5 mr-1",
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                lineNumber: 529,
                                                                columnNumber: 29,
                                                              },
                                                              this,
                                                            ),
                                                            "Send",
                                                          ],
                                                        },
                                                        void 0,
                                                        !0,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                          lineNumber: 523,
                                                          columnNumber: 27,
                                                        },
                                                        this,
                                                      ),
                                                    e.jsxDEV(
                                                      Fe,
                                                      {
                                                        children: [
                                                          e.jsxDEV(
                                                            Ae,
                                                            {
                                                              asChild: !0,
                                                              children:
                                                                e.jsxDEV(
                                                                  l,
                                                                  {
                                                                    variant:
                                                                      "ghost",
                                                                    size: "icon",
                                                                    className:
                                                                      "h-8 w-8",
                                                                    children:
                                                                      e.jsxDEV(
                                                                        ke,
                                                                        {
                                                                          className:
                                                                            "h-4 w-4",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                          lineNumber: 536,
                                                                          columnNumber: 31,
                                                                        },
                                                                        this,
                                                                      ),
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                    lineNumber: 535,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                              lineNumber: 534,
                                                              columnNumber: 27,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            Le,
                                                            {
                                                              align: "end",
                                                              children: [
                                                                e.jsxDEV(
                                                                  V,
                                                                  {
                                                                    onClick:
                                                                      () => {
                                                                        (H(s),
                                                                          C(
                                                                            !0,
                                                                          ));
                                                                      },
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        G,
                                                                        {
                                                                          className:
                                                                            "h-4 w-4 mr-2",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                          lineNumber: 541,
                                                                          columnNumber: 31,
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
                                                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                    lineNumber: 540,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                                e.jsxDEV(
                                                                  V,
                                                                  {
                                                                    onClick:
                                                                      () =>
                                                                        L(
                                                                          s.id,
                                                                          s.invoiceNumber,
                                                                        ),
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        O,
                                                                        {
                                                                          className:
                                                                            "h-4 w-4 mr-2",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                          lineNumber: 545,
                                                                          columnNumber: 31,
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
                                                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                    lineNumber: 544,
                                                                    columnNumber: 29,
                                                                  },
                                                                  this,
                                                                ),
                                                                s.status ===
                                                                  "draft" &&
                                                                  e.jsxDEV(
                                                                    e.Fragment,
                                                                    {
                                                                      children:
                                                                        e.jsxDEV(
                                                                          V,
                                                                          {
                                                                            onClick:
                                                                              () =>
                                                                                w.mutate(
                                                                                  s.id,
                                                                                ),
                                                                            children:
                                                                              [
                                                                                e.jsxDEV(
                                                                                  I,
                                                                                  {
                                                                                    className:
                                                                                      "h-4 w-4 mr-2",
                                                                                  },
                                                                                  void 0,
                                                                                  !1,
                                                                                  {
                                                                                    fileName:
                                                                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                                    lineNumber: 551,
                                                                                    columnNumber: 35,
                                                                                  },
                                                                                  this,
                                                                                ),
                                                                                "Send to Client",
                                                                              ],
                                                                          },
                                                                          void 0,
                                                                          !0,
                                                                          {
                                                                            fileName:
                                                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                            lineNumber: 550,
                                                                            columnNumber: 33,
                                                                          },
                                                                          this,
                                                                        ),
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                      lineNumber: 549,
                                                                      columnNumber: 31,
                                                                    },
                                                                    this,
                                                                  ),
                                                                (s.status ===
                                                                  "draft" ||
                                                                  s.status ===
                                                                    "cancelled") &&
                                                                  e.jsxDEV(
                                                                    e.Fragment,
                                                                    {
                                                                      children:
                                                                        [
                                                                          e.jsxDEV(
                                                                            Me,
                                                                            {},
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                              lineNumber: 558,
                                                                              columnNumber: 33,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          e.jsxDEV(
                                                                            V,
                                                                            {
                                                                              className:
                                                                                "text-destructive",
                                                                              onClick:
                                                                                () =>
                                                                                  T(
                                                                                    s.id,
                                                                                  ),
                                                                              children:
                                                                                [
                                                                                  e.jsxDEV(
                                                                                    Ee,
                                                                                    {
                                                                                      className:
                                                                                        "h-4 w-4 mr-2",
                                                                                    },
                                                                                    void 0,
                                                                                    !1,
                                                                                    {
                                                                                      fileName:
                                                                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                                      lineNumber: 563,
                                                                                      columnNumber: 35,
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
                                                                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                              lineNumber: 559,
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
                                                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                                      lineNumber: 557,
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
                                                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                              lineNumber: 539,
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
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 533,
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
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 507,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                              lineNumber: 506,
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
                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                        lineNumber: 488,
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
                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                  lineNumber: 486,
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
                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                            lineNumber: 475,
                            columnNumber: 13,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                        lineNumber: 474,
                        columnNumber: 11,
                      },
                      this,
                    ),
                e.jsxDEV(
                  _,
                  {
                    open: me,
                    onOpenChange: C,
                    children: e.jsxDEV(
                      W,
                      {
                        className: "max-w-2xl",
                        children: [
                          e.jsxDEV(
                            Z,
                            {
                              children: e.jsxDEV(
                                ee,
                                { children: ["Invoice ", c?.invoiceNumber] },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                  lineNumber: 582,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                              lineNumber: 581,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          c &&
                            e.jsxDEV(
                              "div",
                              {
                                className: "space-y-6",
                                children: [
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className: "flex justify-between",
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
                                                  children: "Bill To",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 589,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className: "font-medium",
                                                  children: c.clientName,
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 590,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-sm text-muted-foreground",
                                                  children: c.clientEmail,
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 591,
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
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 588,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "text-right",
                                            children: [
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-sm text-muted-foreground",
                                                  children: "Invoice Date",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 594,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  children: B(
                                                    new Date(c.createdAt),
                                                    "MMM d, yyyy",
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 595,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  className:
                                                    "text-sm text-muted-foreground mt-2",
                                                  children: "Due Date",
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 596,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "p",
                                                {
                                                  children: B(
                                                    new Date(c.dueDate),
                                                    "MMM d, yyyy",
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 597,
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
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 593,
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
                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                      lineNumber: 587,
                                      columnNumber: 17,
                                    },
                                    this,
                                  ),
                                  e.jsxDEV(
                                    ce,
                                    {
                                      children: [
                                        e.jsxDEV(
                                          le,
                                          {
                                            children: e.jsxDEV(
                                              b,
                                              {
                                                children: [
                                                  e.jsxDEV(
                                                    o,
                                                    { children: "Description" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                      lineNumber: 604,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    o,
                                                    {
                                                      className: "text-right",
                                                      children: "Qty",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                      lineNumber: 605,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    o,
                                                    {
                                                      className: "text-right",
                                                      children: "Price",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                      lineNumber: 606,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    o,
                                                    {
                                                      className: "text-right",
                                                      children: "Total",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                      lineNumber: 607,
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
                                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                lineNumber: 603,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 602,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          ae,
                                          {
                                            children: [
                                              c.items.map((s, r) =>
                                                e.jsxDEV(
                                                  b,
                                                  {
                                                    children: [
                                                      e.jsxDEV(
                                                        a,
                                                        {
                                                          children:
                                                            s.description,
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                          lineNumber: 613,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        a,
                                                        {
                                                          className:
                                                            "text-right",
                                                          children: s.quantity,
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                          lineNumber: 614,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        a,
                                                        {
                                                          className:
                                                            "text-right",
                                                          children: [
                                                            "$",
                                                            s.unitPrice.toFixed(
                                                              2,
                                                            ),
                                                          ],
                                                        },
                                                        void 0,
                                                        !0,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                          lineNumber: 615,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        a,
                                                        {
                                                          className:
                                                            "text-right",
                                                          children: [
                                                            "$",
                                                            (
                                                              s.quantity *
                                                              s.unitPrice
                                                            ).toFixed(2),
                                                          ],
                                                        },
                                                        void 0,
                                                        !0,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                          lineNumber: 616,
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
                                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                    lineNumber: 612,
                                                    columnNumber: 23,
                                                  },
                                                  this,
                                                ),
                                              ),
                                              e.jsxDEV(
                                                b,
                                                {
                                                  children: [
                                                    e.jsxDEV(
                                                      a,
                                                      {
                                                        colSpan: 3,
                                                        className:
                                                          "text-right font-bold",
                                                        children: "Total",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 620,
                                                        columnNumber: 23,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      a,
                                                      {
                                                        className:
                                                          "text-right font-bold",
                                                        children: [
                                                          "$",
                                                          c.amount.toFixed(2),
                                                        ],
                                                      },
                                                      void 0,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 621,
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
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
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
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 610,
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
                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                      lineNumber: 601,
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
                                        z(c.status),
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "flex gap-2",
                                            children: [
                                              e.jsxDEV(
                                                l,
                                                {
                                                  variant: "outline",
                                                  onClick: () =>
                                                    c &&
                                                    L(c.id, c.invoiceNumber),
                                                  children: [
                                                    e.jsxDEV(
                                                      O,
                                                      {
                                                        className:
                                                          "h-4 w-4 mr-2",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                        lineNumber: 630,
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
                                                    "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                  lineNumber: 629,
                                                  columnNumber: 21,
                                                },
                                                this,
                                              ),
                                              c.status === "draft" &&
                                                e.jsxDEV(
                                                  l,
                                                  {
                                                    onClick: () =>
                                                      w.mutate(c.id),
                                                    children: [
                                                      e.jsxDEV(
                                                        I,
                                                        {
                                                          className:
                                                            "h-4 w-4 mr-2",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                          lineNumber: 635,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                      "Send Invoice",
                                                    ],
                                                  },
                                                  void 0,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                                    lineNumber: 634,
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
                                              "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                            lineNumber: 628,
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
                                        "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                      lineNumber: 626,
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
                                  "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                lineNumber: 586,
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
                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                        lineNumber: 580,
                        columnNumber: 11,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                    lineNumber: 579,
                    columnNumber: 9,
                  },
                  this,
                ),
                e.jsxDEV(
                  Ue,
                  {
                    open: !!P,
                    onOpenChange: (s) => {
                      s || T(null);
                    },
                    children: e.jsxDEV(
                      $e,
                      {
                        children: [
                          e.jsxDEV(
                            qe,
                            {
                              children: [
                                e.jsxDEV(
                                  Oe,
                                  { children: "Delete Invoice" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 650,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  Re,
                                  {
                                    children:
                                      "Are you sure you want to delete this invoice? This action cannot be undone.",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 651,
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
                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                              lineNumber: 649,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            Be,
                            {
                              children: [
                                e.jsxDEV(
                                  Qe,
                                  { children: "Cancel" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 656,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  He,
                                  {
                                    className:
                                      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                                    onClick: () => {
                                      P && (pe.mutate(P), T(null));
                                    },
                                    children: "Delete Invoice",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                                    lineNumber: 657,
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
                                "/home/runner/workspace/client/src/pages/Invoices.tsx",
                              lineNumber: 655,
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
                          "/home/runner/workspace/client/src/pages/Invoices.tsx",
                        lineNumber: 648,
                        columnNumber: 11,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Invoices.tsx",
                    lineNumber: 647,
                    columnNumber: 9,
                  },
                  this,
                ),
              ],
            },
            void 0,
            !0,
            {
              fileName: "/home/runner/workspace/client/src/pages/Invoices.tsx",
              lineNumber: 247,
              columnNumber: 7,
            },
            this,
          ),
    },
    void 0,
    !1,
    {
      fileName: "/home/runner/workspace/client/src/pages/Invoices.tsx",
      lineNumber: 241,
      columnNumber: 5,
    },
    this,
  );
}
export { is as default };
