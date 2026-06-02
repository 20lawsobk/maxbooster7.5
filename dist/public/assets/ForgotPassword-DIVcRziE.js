import {
  r as n,
  f as e,
  cV as b,
  cB as F,
  ao as y,
  cy as D,
  b$ as V,
  a_ as x,
  aL as C,
} from "./vendor-react-31oK5L0i.js";
import {
  u as S,
  C as R,
  d as L,
  f as T,
  h as q,
  L as B,
  I,
  j as l,
} from "./studio-DOUfHW5v.js";
import { L as A } from "./Logo-DS4JhmIC.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
function H() {
  const [t, g] = n.useState(""),
    [r, m] = n.useState(""),
    [h, N] = n.useState(!1),
    [c, i] = n.useState(!1),
    [u, w] = n.useState(0),
    { toast: o } = S(),
    p = (s) => {
      if (!s.trim()) return "Email is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
        return "Please enter a valid email address";
    },
    k = (s) => {
      if ((g(s), r)) {
        const a = p(s);
        m(a || "");
      }
    },
    v = () => {
      const s = p(t);
      m(s || "");
    },
    f = () => {
      w(60);
      const s = setInterval(() => {
        w((a) => (a <= 1 ? (clearInterval(s), 0) : a - 1));
      }, 1e3);
    },
    E = async (s) => {
      s.preventDefault();
      const a = p(t);
      if (a) {
        m(a);
        return;
      }
      i(!0);
      try {
        const d = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: t }),
          }),
          j = await d.json();
        if (d.status === 429) {
          (o({
            title: "Too Many Requests",
            description:
              "You have made too many password reset requests. Please wait a few minutes before trying again.",
            variant: "destructive",
          }),
            i(!1));
          return;
        }
        if (!d.ok) throw new Error(j.message || "Failed to send reset link");
        (N(!0),
          f(),
          o({
            title: "Reset Link Sent",
            description: "Check your email for password reset instructions.",
          }));
      } catch {
        (o({
          title: "Request Sent",
          description:
            "If an account exists with this email, you will receive a password reset link.",
        }),
          N(!0),
          f());
      } finally {
        i(!1);
      }
    },
    P = async () => {
      if (!(u > 0)) {
        i(!0);
        try {
          (
            await fetch("/api/auth/forgot-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: t }),
            })
          ).status === 429
            ? o({
                title: "Too Many Requests",
                description:
                  "Please wait before requesting another reset link.",
                variant: "destructive",
              })
            : (f(),
              o({
                title: "Email Resent",
                description:
                  "A new password reset link has been sent to your email.",
              }));
        } catch {
          o({
            title: "Resend Failed",
            description: "Could not resend the reset link. Please try again.",
            variant: "destructive",
          });
        } finally {
          i(!1);
        }
      }
    };
  return e.jsxDEV(
    "div",
    {
      className:
        "min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex flex-col",
      children: [
        e.jsxDEV(
          "div",
          {
            className: "p-4 sm:p-6",
            children: e.jsxDEV(
              b,
              {
                href: "/",
                children: e.jsxDEV(
                  "div",
                  {
                    className: "cursor-pointer",
                    children: e.jsxDEV(
                      A,
                      { size: "md" },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                        lineNumber: 146,
                        columnNumber: 13,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                    lineNumber: 145,
                    columnNumber: 11,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                lineNumber: 144,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
            lineNumber: 143,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          "div",
          {
            className:
              "flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12",
            children: e.jsxDEV(
              R,
              {
                className:
                  "w-full max-w-md dark:bg-gray-900 dark:border-gray-700",
                children: [
                  e.jsxDEV(
                    L,
                    {
                      className: "text-center",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className:
                              "mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4",
                            children: e.jsxDEV(
                              F,
                              { className: "h-6 w-6 text-blue-600" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                lineNumber: 156,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                            lineNumber: 155,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          T,
                          {
                            className: "text-2xl dark:text-white",
                            children: h
                              ? "Check Your Email"
                              : "Forgot Password?",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                            lineNumber: 158,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-gray-600 dark:text-gray-400 mt-2",
                            children: h
                              ? "We've sent password reset instructions to your email"
                              : "Enter your email and we'll send you a reset link",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                            lineNumber: 161,
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
                        "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                      lineNumber: 154,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    q,
                    {
                      children: h
                        ? e.jsxDEV(
                            "div",
                            {
                              className: "text-center space-y-6",
                              children: [
                                e.jsxDEV(
                                  V,
                                  {
                                    className:
                                      "h-16 w-16 text-green-600 mx-auto",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                    lineNumber: 213,
                                    columnNumber: 17,
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
                                            "text-gray-600 dark:text-gray-400 mb-4",
                                          children:
                                            "We've sent a password reset link to:",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                          lineNumber: 215,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "font-medium text-gray-900 dark:text-white mb-6",
                                          children: t,
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                          lineNumber: 216,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-left",
                                          children: e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "flex items-start gap-2",
                                              children: [
                                                e.jsxDEV(
                                                  x,
                                                  {
                                                    className:
                                                      "h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                                    lineNumber: 219,
                                                    columnNumber: 23,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "text-sm",
                                                    children: [
                                                      e.jsxDEV(
                                                        "p",
                                                        {
                                                          className:
                                                            "font-medium text-amber-800 dark:text-amber-300",
                                                          children:
                                                            "Link expires in 1 hour",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                                          lineNumber: 221,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        "p",
                                                        {
                                                          className:
                                                            "text-amber-700 dark:text-amber-400 mt-1",
                                                          children:
                                                            "Can't find it? Check your spam folder or request a new link below.",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                                          lineNumber: 222,
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
                                                      "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                                    lineNumber: 220,
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
                                                "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                              lineNumber: 218,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                          lineNumber: 217,
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
                                      "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                    lineNumber: 214,
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
                                        b,
                                        {
                                          href: "/login",
                                          children: e.jsxDEV(
                                            l,
                                            {
                                              className: "w-full",
                                              "data-testid":
                                                "button-back-to-login",
                                              children: "Back to Login",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                              lineNumber: 231,
                                              columnNumber: 21,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                          lineNumber: 230,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        l,
                                        {
                                          variant: "outline",
                                          className: "w-full",
                                          onClick: P,
                                          disabled: c || u > 0,
                                          "data-testid": "button-resend-email",
                                          children:
                                            u > 0
                                              ? e.jsxDEV(
                                                  e.Fragment,
                                                  {
                                                    children: [
                                                      e.jsxDEV(
                                                        x,
                                                        {
                                                          className:
                                                            "h-4 w-4 mr-2",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                                          lineNumber: 244,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                      "Resend in ",
                                                      u,
                                                      "s",
                                                    ],
                                                  },
                                                  void 0,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                                    lineNumber: 243,
                                                    columnNumber: 23,
                                                  },
                                                  this,
                                                )
                                              : e.jsxDEV(
                                                  e.Fragment,
                                                  {
                                                    children: [
                                                      e.jsxDEV(
                                                        C,
                                                        {
                                                          className:
                                                            "h-4 w-4 mr-2",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                                          lineNumber: 249,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                      "Resend Email",
                                                    ],
                                                  },
                                                  void 0,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                                    lineNumber: 248,
                                                    columnNumber: 23,
                                                  },
                                                  this,
                                                ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                          lineNumber: 235,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        l,
                                        {
                                          variant: "ghost",
                                          size: "sm",
                                          className:
                                            "w-full text-muted-foreground",
                                          onClick: () => {
                                            (N(!1), g(""), m(""));
                                          },
                                          "data-testid":
                                            "button-try-different-email",
                                          children: "Try a different email",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                          lineNumber: 254,
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
                                      "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                    lineNumber: 229,
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
                                "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                              lineNumber: 212,
                              columnNumber: 15,
                            },
                            this,
                          )
                        : e.jsxDEV(
                            "form",
                            {
                              onSubmit: E,
                              className: "space-y-4",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "space-y-1",
                                    children: [
                                      e.jsxDEV(
                                        B,
                                        {
                                          htmlFor: "email",
                                          children: "Email Address",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                          lineNumber: 171,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        I,
                                        {
                                          id: "email",
                                          type: "email",
                                          placeholder: "you@example.com",
                                          required: !0,
                                          value: t,
                                          onChange: (s) => k(s.target.value),
                                          onBlur: v,
                                          disabled: c,
                                          autoComplete: "email",
                                          "data-testid":
                                            "input-forgot-password-email",
                                          className: r
                                            ? "border-destructive"
                                            : "",
                                          "aria-invalid": !!r,
                                          "aria-describedby": r
                                            ? "email-error"
                                            : void 0,
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                          lineNumber: 172,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                      r &&
                                        e.jsxDEV(
                                          "p",
                                          {
                                            id: "email-error",
                                            className:
                                              "text-sm text-destructive flex items-center gap-1",
                                            children: [
                                              e.jsxDEV(
                                                y,
                                                { className: "h-3 w-3" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                                  lineNumber: 189,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              r,
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                            lineNumber: 188,
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
                                      "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                    lineNumber: 170,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  l,
                                  {
                                    type: "submit",
                                    className: "w-full",
                                    disabled: c || !!r,
                                    "data-testid": "button-send-reset-link",
                                    children: c
                                      ? "Sending..."
                                      : "Send Reset Link",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                    lineNumber: 194,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-center",
                                    children: e.jsxDEV(
                                      b,
                                      {
                                        href: "/login",
                                        children: e.jsxDEV(
                                          l,
                                          {
                                            variant: "link",
                                            className: "text-sm",
                                            "data-testid": "link-back-to-login",
                                            children: [
                                              e.jsxDEV(
                                                D,
                                                { className: "h-4 w-4 mr-1" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                                  lineNumber: 205,
                                                  columnNumber: 23,
                                                },
                                                this,
                                              ),
                                              "Back to Login",
                                            ],
                                          },
                                          void 0,
                                          !0,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                            lineNumber: 204,
                                            columnNumber: 21,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                        lineNumber: 203,
                                        columnNumber: 19,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                                    lineNumber: 202,
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
                                "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                              lineNumber: 169,
                              columnNumber: 15,
                            },
                            this,
                          ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                      lineNumber: 167,
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
                  "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
                lineNumber: 153,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName:
              "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
            lineNumber: 152,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    !0,
    {
      fileName: "/home/runner/workspace/client/src/pages/ForgotPassword.tsx",
      lineNumber: 141,
      columnNumber: 5,
    },
    this,
  );
}
export { H as default };
