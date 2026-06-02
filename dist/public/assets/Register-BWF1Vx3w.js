import {
  ag as W,
  ah as Z,
  r as l,
  f as e,
  aY as H,
  aO as J,
  b9 as Q,
  dc as K,
  cU as X,
  cv as C,
  ao as b,
  aW as ee,
  bL as T,
  bK as B,
  b$ as L,
  ac as se,
  cV as w,
  bb as re,
  a_ as te,
} from "./vendor-react-31oK5L0i.js";
import { a as ae, A as ie, f as ne } from "./index-D5xLbTBZ.js";
import { u as oe } from "./useRequireAuth-K5x5riUd.js";
import {
  u as le,
  C as ce,
  d as me,
  f as ue,
  g as de,
  B as he,
  h as pe,
  L as g,
  I as v,
  j as E,
  G as Ne,
  x as ge,
  i as fe,
} from "./studio-DOUfHW5v.js";
import { L as O } from "./Logo-DS4JhmIC.js";
import { G as xe } from "./brand-icons-fQ6nzwsy.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
const be = (c) => {
    const m = [
        { met: c.length >= 8, text: "At least 8 characters" },
        { met: /[A-Z]/.test(c), text: "One uppercase letter" },
        { met: /[a-z]/.test(c), text: "One lowercase letter" },
        { met: /[0-9]/.test(c), text: "One number" },
        { met: /[^A-Za-z0-9]/.test(c), text: "One special character" },
      ],
      o = m.filter((f) => f.met).length;
    return o <= 1
      ? { score: o, label: "Weak", color: "bg-red-500", requirements: m }
      : o <= 2
        ? { score: o, label: "Fair", color: "bg-orange-500", requirements: m }
        : o <= 3
          ? { score: o, label: "Good", color: "bg-yellow-500", requirements: m }
          : o <= 4
            ? {
                score: o,
                label: "Strong",
                color: "bg-green-500",
                requirements: m,
              }
            : {
                score: o,
                label: "Very Strong",
                color: "bg-green-600",
                requirements: m,
              };
  },
  F = {
    google_not_configured: {
      title: "Google Signup Unavailable",
      description:
        "Google sign-up is not configured. Please use email and password.",
    },
    google_denied: {
      title: "Access Denied",
      description: "You cancelled the Google sign-up or denied access.",
    },
    oauth_error: {
      title: "OAuth Error",
      description: "An error occurred during Google sign-up. Please try again.",
    },
  };
function Ce() {
  const [, c] = W(),
    { register: m } = ae(),
    o = Z(),
    { toast: f } = le();
  oe();
  const [i, G] = l.useState({
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      artistName: "",
    }),
    [u, j] = l.useState(!1),
    [A, D] = l.useState(""),
    [t, d] = l.useState({}),
    [n, S] = l.useState({}),
    [R, M] = l.useState(!1),
    [y, U] = l.useState(!1),
    [V, q] = l.useState(!1);
  l.useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("error");
    if (r && F[r]) {
      const { title: a, description: h } = F[r];
      (f({ title: a, description: h, variant: "destructive" }),
        window.history.replaceState({}, "", "/register"));
    }
  }, [f]);
  const p = l.useMemo(() => be(i.password), [i.password]),
    N = (s, r) => {
      switch (s) {
        case "username":
          return r.trim()
            ? r.length < 3
              ? "Username must be at least 3 characters"
              : r.length > 30
                ? "Username must be less than 30 characters"
                : /^[a-zA-Z0-9_]+$/.test(r)
                  ? void 0
                  : "Username can only contain letters, numbers, and underscores"
            : "Username is required";
        case "email":
          return r.trim()
            ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)
              ? void 0
              : "Please enter a valid email address"
            : "Email is required";
        case "password":
          return r
            ? r.length < 8
              ? "Password must be at least 8 characters"
              : void 0
            : "Password is required";
        case "confirmPassword":
          return r
            ? r !== i.password
              ? "Passwords do not match"
              : void 0
            : "Please confirm your password";
        default:
          return;
      }
    },
    k = (s) => {
      S((a) => ({ ...a, [s]: !0 }));
      const r = N(s, i[s]);
      d((a) => ({ ...a, [s]: r }));
    },
    x = (s, r) => {
      if ((G((a) => ({ ...a, [s]: r })), n[s])) {
        const a = N(s, r);
        d((h) => ({ ...h, [s]: a }));
      }
      if (s === "password" && n.confirmPassword && i.confirmPassword) {
        const a = r !== i.confirmPassword ? "Passwords do not match" : void 0;
        d((h) => ({ ...h, confirmPassword: a }));
      }
    },
    I = () => {
      const s = {
        username: N("username", i.username),
        email: N("email", i.email),
        password: N("password", i.password),
        confirmPassword: N("confirmPassword", i.confirmPassword),
        termsAccepted: V
          ? void 0
          : "You must accept the Terms of Service and Privacy Policy",
      };
      return (
        d(s),
        S({
          username: !0,
          email: !0,
          password: !0,
          confirmPassword: !0,
          termsAccepted: !0,
        }),
        !Object.values(s).some((r) => r !== void 0)
      );
    },
    z = (s, r) => {
      const a = s.toLowerCase();
      return r === 429
        ? "Too many registration attempts. Please wait a few minutes before trying again."
        : a.includes("email") && a.includes("exists")
          ? "This email is already registered. Please sign in or use a different email."
          : a.includes("username") &&
              (a.includes("exists") || a.includes("taken"))
            ? "This username is already taken. Please choose a different one."
            : a.includes("password") && a.includes("weak")
              ? "Please choose a stronger password with at least 8 characters, including uppercase, lowercase, and numbers."
              : s;
    },
    $ = async (s) => {
      if ((s.preventDefault(), D(""), !!I())) {
        j(!0);
        try {
          const r = await fetch("/api/auth/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(i),
            }),
            a = await r.json();
          if (!r.ok) {
            const h = z(a.message || "Registration failed", r.status);
            (D(h),
              a.message?.toLowerCase().includes("email")
                ? d((P) => ({
                    ...P,
                    email: "This email is already registered",
                  }))
                : a.message?.toLowerCase().includes("username") &&
                  d((P) => ({
                    ...P,
                    username: "This username is already taken",
                  })),
              j(!1));
            return;
          }
          (f({
            title: "Account created successfully!",
            description: "Welcome to Max Booster! Let's get started.",
          }),
            o.setQueryData(["/api/auth/me"], a),
            c("/dashboard"));
        } catch {
          D(
            "Unable to connect to the server. Please check your internet connection and try again.",
          );
        } finally {
          j(!1);
        }
      }
    },
    Y = () => {
      window.location.href = "/api/auth/google";
    },
    _ = [
      { icon: H, text: "AI-powered music creation" },
      { icon: J, text: "1000+ professional plugins" },
      { icon: Q, text: "10x growth acceleration" },
      { icon: K, text: "Automated social media" },
      { icon: X, text: "Revenue optimization" },
    ];
  return e.jsxDEV(
    "div",
    {
      className:
        "min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex",
      children: [
        e.jsxDEV(
          "div",
          {
            className:
              "hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-cyan-600 p-12 text-white",
            children: e.jsxDEV(
              "div",
              {
                className: "flex flex-col justify-center",
                children: [
                  e.jsxDEV(
                    O,
                    { size: "lg", className: "mb-8" },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Register.tsx",
                      lineNumber: 252,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "h1",
                    {
                      className: "text-4xl font-bold mb-6",
                      children: "Start Your Music Empire Today",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Register.tsx",
                      lineNumber: 253,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "p",
                    {
                      className: "text-xl mb-8 opacity-90",
                      children:
                        "Join thousands of artists using AI to 10x their career growth",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Register.tsx",
                      lineNumber: 254,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "space-y-4 mb-8",
                      children: _.map((s, r) =>
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center space-x-3",
                            children: [
                              e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "w-10 h-10 bg-white/20 rounded-full flex items-center justify-center",
                                  children: e.jsxDEV(
                                    s.icon,
                                    { className: "w-5 h-5" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Register.tsx",
                                      lineNumber: 262,
                                      columnNumber: 19,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 261,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                { className: "text-lg", children: s.text },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 264,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                            ],
                          },
                          r,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Register.tsx",
                            lineNumber: 260,
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
                        "/home/runner/workspace/client/src/pages/Register.tsx",
                      lineNumber: 258,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "bg-white/10 rounded-lg p-6 backdrop-blur-sm",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "flex items-center space-x-2 mb-3",
                            children: [
                              e.jsxDEV(
                                C,
                                { className: "w-5 h-5" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 271,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                {
                                  className: "font-semibold",
                                  children: "90-Day Money Back Guarantee",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 272,
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
                              "/home/runner/workspace/client/src/pages/Register.tsx",
                            lineNumber: 270,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-sm opacity-80",
                            children:
                              "Purchase Max Booster with confidence. If you're not completely satisfied within 90 days, get a full refund - no questions asked!",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Register.tsx",
                            lineNumber: 274,
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
                        "/home/runner/workspace/client/src/pages/Register.tsx",
                      lineNumber: 269,
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
                  "/home/runner/workspace/client/src/pages/Register.tsx",
                lineNumber: 251,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Register.tsx",
            lineNumber: 250,
            columnNumber: 7,
          },
          this,
        ),
        e.jsxDEV(
          "div",
          {
            className: "flex-1 flex items-center justify-center p-8",
            children: e.jsxDEV(
              ce,
              {
                className:
                  "w-full max-w-md dark:bg-gray-900 dark:border-gray-700",
                children: [
                  e.jsxDEV(
                    me,
                    {
                      className: "text-center",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className: "lg:hidden mb-4",
                            children: e.jsxDEV(
                              O,
                              { size: "md" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Register.tsx",
                                lineNumber: 287,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Register.tsx",
                            lineNumber: 286,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          ue,
                          {
                            className: "text-2xl dark:text-white",
                            children: "Create Your Account",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Register.tsx",
                            lineNumber: 289,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          de,
                          {
                            className: "space-y-2 dark:text-gray-400",
                            children: [
                              e.jsxDEV(
                                "span",
                                {
                                  children:
                                    "Start your journey to music success",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 291,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                he,
                                {
                                  className:
                                    "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border-green-300 dark:border-green-700 px-3 py-1",
                                  children: [
                                    e.jsxDEV(
                                      C,
                                      { className: "w-4 h-4 mr-1" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 293,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    "90-Day Money Back Guarantee",
                                  ],
                                },
                                void 0,
                                !0,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 292,
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
                              "/home/runner/workspace/client/src/pages/Register.tsx",
                            lineNumber: 290,
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
                        "/home/runner/workspace/client/src/pages/Register.tsx",
                      lineNumber: 285,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    pe,
                    {
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className:
                              "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6",
                            children: e.jsxDEV(
                              "div",
                              {
                                className: "flex items-start space-x-3",
                                children: [
                                  e.jsxDEV(
                                    C,
                                    {
                                      className:
                                        "w-5 h-5 text-green-600 mt-0.5",
                                    },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/Register.tsx",
                                      lineNumber: 303,
                                      columnNumber: 17,
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
                                              "font-semibold text-green-800 dark:text-green-300",
                                            children: "100% Risk-Free",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Register.tsx",
                                            lineNumber: 305,
                                            columnNumber: 19,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "p",
                                          {
                                            className:
                                              "text-green-700 dark:text-green-400",
                                            children:
                                              "Your purchase is protected for 90 days. If you're not satisfied, get a full refund - no questions asked.",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Register.tsx",
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
                                        "/home/runner/workspace/client/src/pages/Register.tsx",
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
                                  "/home/runner/workspace/client/src/pages/Register.tsx",
                                lineNumber: 302,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Register.tsx",
                            lineNumber: 301,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        A &&
                          e.jsxDEV(
                            ie,
                            {
                              variant: "destructive",
                              className: "mb-4",
                              children: e.jsxDEV(
                                ne,
                                { children: A },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 316,
                                  columnNumber: 17,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Register.tsx",
                              lineNumber: 315,
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
                                  className: "space-y-1",
                                  children: [
                                    e.jsxDEV(
                                      g,
                                      {
                                        htmlFor: "username",
                                        children: "Username",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 322,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      v,
                                      {
                                        id: "username",
                                        type: "text",
                                        placeholder: "Choose a unique username",
                                        value: i.username,
                                        onChange: (s) =>
                                          x("username", s.target.value),
                                        onBlur: () => k("username"),
                                        required: !0,
                                        disabled: u,
                                        autoComplete: "username",
                                        "data-testid": "input-username",
                                        className:
                                          t.username && n.username
                                            ? "border-destructive"
                                            : "",
                                        "aria-invalid": !!(
                                          t.username && n.username
                                        ),
                                        "aria-describedby": t.username
                                          ? "username-error"
                                          : void 0,
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 323,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    t.username &&
                                      n.username &&
                                      e.jsxDEV(
                                        "p",
                                        {
                                          id: "username-error",
                                          className:
                                            "text-sm text-destructive flex items-center gap-1",
                                          children: [
                                            e.jsxDEV(
                                              b,
                                              { className: "h-3 w-3" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Register.tsx",
                                                lineNumber: 340,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            t.username,
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Register.tsx",
                                          lineNumber: 339,
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
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 321,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-1",
                                  children: [
                                    e.jsxDEV(
                                      g,
                                      {
                                        htmlFor: "artistName",
                                        className: "flex items-center gap-1.5",
                                        children: [
                                          e.jsxDEV(
                                            ee,
                                            {
                                              className:
                                                "h-3.5 w-3.5 text-muted-foreground",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Register.tsx",
                                              lineNumber: 348,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          "Artist / Producer Name",
                                          e.jsxDEV(
                                            "span",
                                            {
                                              className:
                                                "text-xs text-muted-foreground font-normal",
                                              children:
                                                "(optional — powers auto-discovery)",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Register.tsx",
                                              lineNumber: 350,
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
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 347,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      v,
                                      {
                                        id: "artistName",
                                        type: "text",
                                        placeholder:
                                          "Your stage name or producer alias",
                                        value: i.artistName,
                                        onChange: (s) =>
                                          x("artistName", s.target.value),
                                        disabled: u,
                                        autoComplete: "nickname",
                                        "data-testid": "input-artist-name",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 352,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "p",
                                      {
                                        className:
                                          "text-xs text-muted-foreground",
                                        children:
                                          "We'll automatically find your profiles on Spotify, Apple Music & Deezer.",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 362,
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
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 346,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-1",
                                  children: [
                                    e.jsxDEV(
                                      g,
                                      { htmlFor: "email", children: "Email" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 368,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      v,
                                      {
                                        id: "email",
                                        type: "email",
                                        placeholder: "your@email.com",
                                        value: i.email,
                                        onChange: (s) =>
                                          x("email", s.target.value),
                                        onBlur: () => k("email"),
                                        required: !0,
                                        disabled: u,
                                        autoComplete: "email",
                                        "data-testid": "input-email",
                                        className:
                                          t.email && n.email
                                            ? "border-destructive"
                                            : "",
                                        "aria-invalid": !!(t.email && n.email),
                                        "aria-describedby": t.email
                                          ? "email-error"
                                          : void 0,
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 369,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    t.email &&
                                      n.email &&
                                      e.jsxDEV(
                                        "p",
                                        {
                                          id: "email-error",
                                          className:
                                            "text-sm text-destructive flex items-center gap-1",
                                          children: [
                                            e.jsxDEV(
                                              b,
                                              { className: "h-3 w-3" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Register.tsx",
                                                lineNumber: 386,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            t.email,
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Register.tsx",
                                          lineNumber: 385,
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
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 367,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-1",
                                  children: [
                                    e.jsxDEV(
                                      g,
                                      {
                                        htmlFor: "password",
                                        children: "Password",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 393,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "relative",
                                        children: [
                                          e.jsxDEV(
                                            v,
                                            {
                                              id: "password",
                                              type: R ? "text" : "password",
                                              placeholder:
                                                "Create a strong password",
                                              value: i.password,
                                              onChange: (s) =>
                                                x("password", s.target.value),
                                              onBlur: () => k("password"),
                                              required: !0,
                                              disabled: u,
                                              autoComplete: "new-password",
                                              "data-testid": "input-password",
                                              className: `pr-10 ${t.password && n.password ? "border-destructive" : ""}`,
                                              "aria-invalid": !!(
                                                t.password && n.password
                                              ),
                                              "aria-describedby":
                                                "password-strength password-error",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Register.tsx",
                                              lineNumber: 395,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            E,
                                            {
                                              type: "button",
                                              variant: "ghost",
                                              size: "sm",
                                              className:
                                                "absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent",
                                              onClick: () => M(!R),
                                              "data-testid":
                                                "button-toggle-password",
                                              children: R
                                                ? e.jsxDEV(
                                                    T,
                                                    { className: "h-4 w-4" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Register.tsx",
                                                      lineNumber: 418,
                                                      columnNumber: 37,
                                                    },
                                                    this,
                                                  )
                                                : e.jsxDEV(
                                                    B,
                                                    { className: "h-4 w-4" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Register.tsx",
                                                      lineNumber: 418,
                                                      columnNumber: 70,
                                                    },
                                                    this,
                                                  ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Register.tsx",
                                              lineNumber: 410,
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
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 394,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    i.password &&
                                      e.jsxDEV(
                                        "div",
                                        {
                                          id: "password-strength",
                                          className: "space-y-2 mt-2",
                                          children: [
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "flex items-center gap-2",
                                                children: [
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden",
                                                      children: e.jsxDEV(
                                                        "div",
                                                        {
                                                          className: `h-full transition-all duration-300 ${p.color}`,
                                                          style: {
                                                            width: `${(p.score / 5) * 100}%`,
                                                          },
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Register.tsx",
                                                          lineNumber: 425,
                                                          columnNumber: 25,
                                                        },
                                                        this,
                                                      ),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Register.tsx",
                                                      lineNumber: 424,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "span",
                                                    {
                                                      className: `text-xs font-medium ${p.score <= 2 ? "text-red-600" : p.score <= 3 ? "text-yellow-600" : "text-green-600"}`,
                                                      children: p.label,
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Register.tsx",
                                                      lineNumber: 430,
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
                                                  "/home/runner/workspace/client/src/pages/Register.tsx",
                                                lineNumber: 423,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "grid grid-cols-2 gap-1",
                                                children: p.requirements.map(
                                                  (s, r) =>
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className: `text-xs flex items-center gap-1 ${s.met ? "text-green-600" : "text-gray-500"}`,
                                                        children: [
                                                          s.met
                                                            ? e.jsxDEV(
                                                                L,
                                                                {
                                                                  className:
                                                                    "h-3 w-3",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                                                  lineNumber: 440,
                                                                  columnNumber: 38,
                                                                },
                                                                this,
                                                              )
                                                            : e.jsxDEV(
                                                                se,
                                                                {
                                                                  className:
                                                                    "h-3 w-3",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                                                  lineNumber: 440,
                                                                  columnNumber: 76,
                                                                },
                                                                this,
                                                              ),
                                                          s.text,
                                                        ],
                                                      },
                                                      r,
                                                      !0,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                                        lineNumber: 439,
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
                                                  "/home/runner/workspace/client/src/pages/Register.tsx",
                                                lineNumber: 437,
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
                                            "/home/runner/workspace/client/src/pages/Register.tsx",
                                          lineNumber: 422,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                    t.password &&
                                      n.password &&
                                      e.jsxDEV(
                                        "p",
                                        {
                                          id: "password-error",
                                          className:
                                            "text-sm text-destructive flex items-center gap-1",
                                          children: [
                                            e.jsxDEV(
                                              b,
                                              { className: "h-3 w-3" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Register.tsx",
                                                lineNumber: 449,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            t.password,
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Register.tsx",
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
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 392,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-1",
                                  children: [
                                    e.jsxDEV(
                                      g,
                                      {
                                        htmlFor: "confirmPassword",
                                        children: "Confirm Password",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 456,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "relative",
                                        children: [
                                          e.jsxDEV(
                                            v,
                                            {
                                              id: "confirmPassword",
                                              type: y ? "text" : "password",
                                              placeholder:
                                                "Confirm your password",
                                              value: i.confirmPassword,
                                              onChange: (s) =>
                                                x(
                                                  "confirmPassword",
                                                  s.target.value,
                                                ),
                                              onBlur: () =>
                                                k("confirmPassword"),
                                              required: !0,
                                              disabled: u,
                                              autoComplete: "new-password",
                                              "data-testid":
                                                "input-confirm-password",
                                              className: `pr-10 ${t.confirmPassword && n.confirmPassword ? "border-destructive" : ""}`,
                                              "aria-invalid": !!(
                                                t.confirmPassword &&
                                                n.confirmPassword
                                              ),
                                              "aria-describedby":
                                                t.confirmPassword
                                                  ? "confirm-password-error"
                                                  : void 0,
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Register.tsx",
                                              lineNumber: 458,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            E,
                                            {
                                              type: "button",
                                              variant: "ghost",
                                              size: "sm",
                                              className:
                                                "absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent",
                                              onClick: () => U(!y),
                                              "data-testid":
                                                "button-toggle-confirm-password",
                                              children: y
                                                ? e.jsxDEV(
                                                    T,
                                                    { className: "h-4 w-4" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Register.tsx",
                                                      lineNumber: 481,
                                                      columnNumber: 44,
                                                    },
                                                    this,
                                                  )
                                                : e.jsxDEV(
                                                    B,
                                                    { className: "h-4 w-4" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Register.tsx",
                                                      lineNumber: 481,
                                                      columnNumber: 77,
                                                    },
                                                    this,
                                                  ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Register.tsx",
                                              lineNumber: 473,
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
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 457,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    i.confirmPassword &&
                                      i.password === i.confirmPassword &&
                                      e.jsxDEV(
                                        "p",
                                        {
                                          className:
                                            "text-sm text-green-600 flex items-center gap-1",
                                          children: [
                                            e.jsxDEV(
                                              L,
                                              { className: "h-3 w-3" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Register.tsx",
                                                lineNumber: 486,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            "Passwords match",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Register.tsx",
                                          lineNumber: 485,
                                          columnNumber: 19,
                                        },
                                        this,
                                      ),
                                    t.confirmPassword &&
                                      n.confirmPassword &&
                                      e.jsxDEV(
                                        "p",
                                        {
                                          id: "confirm-password-error",
                                          className:
                                            "text-sm text-destructive flex items-center gap-1",
                                          children: [
                                            e.jsxDEV(
                                              b,
                                              { className: "h-3 w-3" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Register.tsx",
                                                lineNumber: 492,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            t.confirmPassword,
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Register.tsx",
                                          lineNumber: 491,
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
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 455,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-1",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className: "flex items-start space-x-3",
                                        children: [
                                          e.jsxDEV(
                                            Ne,
                                            {
                                              id: "terms",
                                              checked: V,
                                              onCheckedChange: (s) => {
                                                (q(s === !0),
                                                  t.termsAccepted &&
                                                    d((r) => ({
                                                      ...r,
                                                      termsAccepted: void 0,
                                                    })));
                                              },
                                              "data-testid": "checkbox-terms",
                                              "aria-describedby":
                                                t.termsAccepted
                                                  ? "terms-error"
                                                  : void 0,
                                              className: "mt-0.5",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Register.tsx",
                                              lineNumber: 500,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            g,
                                            {
                                              htmlFor: "terms",
                                              className:
                                                "text-sm font-normal leading-tight cursor-pointer",
                                              children: [
                                                "I agree to the",
                                                " ",
                                                e.jsxDEV(
                                                  w,
                                                  {
                                                    href: "/terms",
                                                    className:
                                                      "text-primary hover:underline",
                                                    children:
                                                      "Terms of Service",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Register.tsx",
                                                    lineNumber: 515,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                " ",
                                                "and",
                                                " ",
                                                e.jsxDEV(
                                                  w,
                                                  {
                                                    href: "/privacy",
                                                    className:
                                                      "text-primary hover:underline",
                                                    children: "Privacy Policy",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Register.tsx",
                                                    lineNumber: 519,
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
                                                "/home/runner/workspace/client/src/pages/Register.tsx",
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
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 499,
                                        columnNumber: 17,
                                      },
                                      this,
                                    ),
                                    t.termsAccepted &&
                                      n.termsAccepted &&
                                      e.jsxDEV(
                                        "p",
                                        {
                                          id: "terms-error",
                                          className:
                                            "text-sm text-destructive flex items-center gap-1 ml-6",
                                          children: [
                                            e.jsxDEV(
                                              b,
                                              { className: "h-3 w-3" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Register.tsx",
                                                lineNumber: 526,
                                                columnNumber: 21,
                                              },
                                              this,
                                            ),
                                            t.termsAccepted,
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Register.tsx",
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
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 498,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                E,
                                {
                                  type: "submit",
                                  className:
                                    "w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700",
                                  disabled:
                                    u ||
                                    !V ||
                                    (Object.keys(n).length > 0 &&
                                      Object.values(t).some((s) => s)),
                                  "data-testid": "button-create-account",
                                  children: [
                                    u
                                      ? "Creating Account..."
                                      : "Create Your Account",
                                    e.jsxDEV(
                                      re,
                                      { className: "w-4 h-4 ml-2" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Register.tsx",
                                        lineNumber: 539,
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
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
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
                              "/home/runner/workspace/client/src/pages/Register.tsx",
                            lineNumber: 320,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          ge,
                          { className: "my-4" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Register.tsx",
                            lineNumber: 543,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          E,
                          {
                            type: "button",
                            variant: "outline",
                            className: "w-full",
                            onClick: Y,
                            "data-testid": "button-google-signup",
                            children: [
                              e.jsxDEV(
                                xe,
                                { className: "mr-2 h-4 w-4" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 552,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              "Sign up with Google",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Register.tsx",
                            lineNumber: 545,
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
                        "/home/runner/workspace/client/src/pages/Register.tsx",
                      lineNumber: 299,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    fe,
                    {
                      className: "flex flex-col space-y-3",
                      children: [
                        e.jsxDEV(
                          "div",
                          {
                            className:
                              "flex items-center justify-center text-xs text-green-600 dark:text-green-400",
                            children: [
                              e.jsxDEV(
                                te,
                                { className: "w-3 h-3 mr-1" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 559,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "span",
                                {
                                  children:
                                    "90-day money back guarantee applies to all plans",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 560,
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
                              "/home/runner/workspace/client/src/pages/Register.tsx",
                            lineNumber: 558,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className:
                              "text-center text-sm text-muted-foreground",
                            children: [
                              "Already have an account?",
                              " ",
                              e.jsxDEV(
                                w,
                                {
                                  href: "/login",
                                  className: "text-primary hover:underline",
                                  children: "Sign in",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 564,
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
                              "/home/runner/workspace/client/src/pages/Register.tsx",
                            lineNumber: 562,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "div",
                          {
                            className:
                              "text-center text-xs text-muted-foreground",
                            children: [
                              "By creating an account, you agree to our",
                              " ",
                              e.jsxDEV(
                                w,
                                {
                                  href: "/terms",
                                  className: "hover:underline",
                                  children: "Terms",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 570,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                              " ",
                              "and",
                              " ",
                              e.jsxDEV(
                                w,
                                {
                                  href: "/privacy",
                                  className: "hover:underline",
                                  children: "Privacy Policy",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Register.tsx",
                                  lineNumber: 574,
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
                              "/home/runner/workspace/client/src/pages/Register.tsx",
                            lineNumber: 568,
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
                        "/home/runner/workspace/client/src/pages/Register.tsx",
                      lineNumber: 557,
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
                  "/home/runner/workspace/client/src/pages/Register.tsx",
                lineNumber: 284,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Register.tsx",
            lineNumber: 283,
            columnNumber: 7,
          },
          this,
        ),
      ],
    },
    void 0,
    !0,
    {
      fileName: "/home/runner/workspace/client/src/pages/Register.tsx",
      lineNumber: 248,
      columnNumber: 5,
    },
    this,
  );
}
export { Ce as default };
