import {
  dd as W,
  r as b,
  ag as F,
  f as e,
  cV as g,
  bw as P,
  aL as V,
  cy as J,
  v as X,
  fv as z,
  cv as U,
  cA as K,
  fw as H,
  fx as Q,
  fy as Z,
  ap as ee,
  de as re,
} from "./vendor-react-31oK5L0i.js";
import { a as se, A as ie, i as ne, f as ae } from "./index-D5xLbTBZ.js";
import {
  u as M,
  a as te,
  C as h,
  h as f,
  j as d,
  d as C,
  B as I,
  f as _,
} from "./studio-DOUfHW5v.js";
import { L as ce } from "./Logo-DS4JhmIC.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
function D(i) {
  "@babel/helpers - typeof";
  return (
    typeof Symbol == "function" && typeof Symbol.iterator == "symbol"
      ? (D = function (r) {
          return typeof r;
        })
      : (D = function (r) {
          return r &&
            typeof Symbol == "function" &&
            r.constructor === Symbol &&
            r !== Symbol.prototype
            ? "symbol"
            : typeof r;
        }),
    D(i)
  );
}
var $ = "clover",
  le = function (r) {
    return r === 3 ? "v3" : r;
  },
  B = "https://js.stripe.com",
  oe = "".concat(B, "/").concat($, "/stripe.js"),
  me = /^https:\/\/js\.stripe\.com\/v3\/?(\?.*)?$/,
  ue = /^https:\/\/js\.stripe\.com\/(v3|[a-z]+)\/stripe\.js(\?.*)?$/;
var be = function (r) {
    return me.test(r) || ue.test(r);
  },
  de = function () {
    for (
      var r = document.querySelectorAll('script[src^="'.concat(B, '"]')), s = 0;
      s < r.length;
      s++
    ) {
      var t = r[s];
      if (be(t.src)) return t;
    }
    return null;
  },
  A = function (r) {
    var s = "",
      t = document.createElement("script");
    t.src = "".concat(oe).concat(s);
    var n = document.head || document.body;
    if (!n)
      throw new Error(
        "Expected document.body not to be null. Stripe.js requires a <body> element.",
      );
    return (n.appendChild(t), t);
  },
  pe = function (r, s) {
    !r ||
      !r._registerWrapper ||
      r._registerWrapper({ name: "stripe-js", version: "8.7.0", startTime: s });
  },
  w = null,
  k = null,
  j = null,
  Ne = function (r) {
    return function (s) {
      r(new Error("Failed to load Stripe.js", { cause: s }));
    };
  },
  he = function (r, s) {
    return function () {
      window.Stripe
        ? r(window.Stripe)
        : s(new Error("Stripe.js not available"));
    };
  },
  fe = function (r) {
    return w !== null
      ? w
      : ((w = new Promise(function (s, t) {
          if (typeof window > "u" || typeof document > "u") {
            s(null);
            return;
          }
          if (window.Stripe) {
            s(window.Stripe);
            return;
          }
          try {
            var n = de();
            if (!(n && r)) {
              if (!n) n = A(r);
              else if (n && j !== null && k !== null) {
                var l;
                (n.removeEventListener("load", j),
                  n.removeEventListener("error", k),
                  (l = n.parentNode) === null ||
                    l === void 0 ||
                    l.removeChild(n),
                  (n = A(r)));
              }
            }
            ((j = he(s, t)),
              (k = Ne(t)),
              n.addEventListener("load", j),
              n.addEventListener("error", k));
          } catch (m) {
            t(m);
            return;
          }
        })),
        w.catch(function (s) {
          return ((w = null), Promise.reject(s));
        }));
  },
  xe = function (r, s, t) {
    if (r === null) return null;
    var n = s[0];
    if (typeof n != "string")
      throw new Error(
        "Expected publishable key to be of type string, got type ".concat(
          D(n),
          " instead.",
        ),
      );
    var l = n.match(/^pk_test/),
      m = le(r.version),
      u = $;
    l &&
      m !== u &&
      console.warn(
        "Stripe.js@"
          .concat(m, " was loaded on the page, but @stripe/stripe-js@")
          .concat("8.7.0", " expected Stripe.js@")
          .concat(
            u,
            ". This may result in unexpected behavior. For more information, see https://docs.stripe.com/sdks/stripejs-versioning",
          ),
      );
    var p = r.apply(void 0, s);
    return (pe(p, t), p);
  },
  E,
  Y = !1,
  G = function () {
    return (
      E ||
      ((E = fe(null).catch(function (r) {
        return ((E = null), Promise.reject(r));
      })),
      E)
    );
  };
Promise.resolve()
  .then(function () {
    return G();
  })
  .catch(function (i) {
    Y || console.warn(i);
  });
var ge = function () {
  for (var r = arguments.length, s = new Array(r), t = 0; t < r; t++)
    s[t] = arguments[t];
  Y = !0;
  var n = Date.now();
  return G().then(function (l) {
    return xe(l, s, n);
  });
};
const ve =
    "pk_live_51RRVbLGIdnrORdO6jx5cmJO1JCrObvIqtOoXe9pE3FY2TVRPrAtvbabHYZxoMXVVKckJMaKQ2bhArzMYuBDCMTjz00vXwm6Ch9",
  T = ge(ve),
  L = (i) => {
    switch (i.code || i.type) {
      case "card_declined":
      case "PAYMENT_DECLINED":
        return {
          message:
            "Your card was declined. Please try a different payment method.",
          canRetry: !0,
        };
      case "incorrect_cvc":
      case "CARD_VALIDATION_ERROR":
        return {
          message:
            "Your card information is incorrect. Please check and try again.",
          canRetry: !0,
        };
      case "expired_card":
      case "CARD_EXPIRED":
        return {
          message:
            "Your card has expired. Please use a different payment method.",
          canRetry: !0,
        };
      case "insufficient_funds":
      case "INSUFFICIENT_FUNDS":
        return {
          message: "Insufficient funds. Please try a different payment method.",
          canRetry: !0,
        };
      case "authentication_required":
      case "REQUIRES_3D_SECURE":
        return {
          message:
            "Additional authentication is required. Please complete the verification.",
          canRetry: !0,
        };
      case "processing_error":
        return {
          message:
            "An error occurred while processing your payment. Please try again.",
          canRetry: !0,
        };
      case "STRIPE_NOT_CONFIGURED":
        return {
          message:
            "Payment service is temporarily unavailable. Please try again later.",
          canRetry: !1,
        };
      case "RATE_LIMITED":
        return {
          message: "Too many requests. Please wait a moment and try again.",
          canRetry: !0,
        };
      default:
        return {
          message: i.message || "An unexpected error occurred.",
          canRetry: i.retryable ?? !0,
        };
    }
  },
  ye = {
    monthly: {
      id: "monthly",
      name: "Monthly Plan",
      price: 49,
      period: "month",
      priceId: "price_monthly_49",
      description: "Perfect for getting started",
      features: [
        "All AI Tools & Studio Access",
        "Up to 5 Active Projects",
        "Basic Analytics Dashboard",
        "Social Media Management",
        "Email Support",
        "Cloud Storage (10GB)",
        "Basic Distribution",
      ],
    },
    yearly: {
      id: "yearly",
      name: "Yearly Plan",
      price: 39,
      originalPrice: 49,
      period: "month",
      priceId: "price_yearly_468",
      description: "Best value for serious artists",
      features: [
        "Everything in Monthly",
        "Unlimited Active Projects",
        "Advanced Analytics & Insights",
        "Priority Social Media Tools",
        "Advanced Distribution Network",
        "Priority Email & Chat Support",
        "Cloud Storage (100GB)",
        "Advanced AI Mastering",
        "Royalty Analytics",
        "Custom Branding",
      ],
    },
    lifetime: {
      id: "lifetime",
      name: "Lifetime Plan",
      price: 699,
      period: "once",
      priceId: "price_lifetime_699",
      description: "Complete access forever",
      features: [
        "Everything in Yearly",
        "Lifetime Access - No Recurring Fees",
        "Unlimited Everything",
        "White-label Options",
        "API Access",
        "Premium Support (Phone & Video)",
        "Unlimited Cloud Storage",
        "Early Access to New Features",
        "Personal Account Manager",
        "Custom Integrations",
      ],
    },
  },
  Se = ({ plan: i, onRetry: r }) => {
    const s = H(),
      t = Q(),
      { toast: n } = M(),
      [, l] = F(),
      [m, u] = b.useState(!1),
      [p, N] = b.useState(null),
      [v, y] = b.useState(0),
      a = async (S) => {
        if ((S.preventDefault(), N(null), !s || !t)) {
          N({
            message: "Payment system is not ready. Please wait a moment.",
            canRetry: !0,
          });
          return;
        }
        u(!0);
        try {
          const { error: o, paymentIntent: c } = await s.confirmPayment({
            elements: t,
            confirmParams: {
              return_url: `${window.location.origin}/dashboard?payment=success`,
            },
            redirect: "if_required",
          });
          if (o) {
            const R = L(o);
            (N(R),
              y((q) => q + 1),
              n({
                title: "Payment Failed",
                description: R.message,
                variant: "destructive",
              }));
          } else
            c?.status === "succeeded"
              ? (n({
                  title: "Payment Successful!",
                  description: `Welcome to Max Booster ${i.name}!`,
                }),
                l("/dashboard?payment=success"))
              : c?.status === "processing"
                ? (n({
                    title: "Payment Processing",
                    description:
                      "Your payment is being processed. You will be notified once complete.",
                  }),
                  l("/dashboard?payment=processing"))
                : c?.status === "requires_action" &&
                  n({
                    title: "Additional Verification Required",
                    description:
                      "Please complete the verification in the popup window.",
                  });
        } catch (o) {
          const c = L(o);
          (N(c),
            n({
              title: "Payment Error",
              description: c.message,
              variant: "destructive",
            }));
        } finally {
          u(!1);
        }
      },
      x = () => {
        (N(null), r && r());
      };
    return e.jsxDEV(
      "form",
      {
        onSubmit: a,
        className: "space-y-6",
        children: [
          p &&
            e.jsxDEV(
              ie,
              {
                variant: "destructive",
                className: "mb-4",
                children: [
                  e.jsxDEV(
                    P,
                    { className: "h-4 w-4" },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                      lineNumber: 198,
                      columnNumber: 11,
                    },
                    void 0,
                  ),
                  e.jsxDEV(
                    ne,
                    { children: "Payment Failed" },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                      lineNumber: 199,
                      columnNumber: 11,
                    },
                    void 0,
                  ),
                  e.jsxDEV(
                    ae,
                    {
                      className: "space-y-2",
                      children: [
                        e.jsxDEV(
                          "p",
                          { children: p.message },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                            lineNumber: 201,
                            columnNumber: 13,
                          },
                          void 0,
                        ),
                        p.canRetry &&
                          v < 3 &&
                          e.jsxDEV(
                            d,
                            {
                              type: "button",
                              variant: "outline",
                              size: "sm",
                              onClick: x,
                              className: "mt-2",
                              children: [
                                e.jsxDEV(
                                  V,
                                  { className: "h-3 w-3 mr-1" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                    lineNumber: 210,
                                    columnNumber: 17,
                                  },
                                  void 0,
                                ),
                                "Try Again",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                              lineNumber: 203,
                              columnNumber: 15,
                            },
                            void 0,
                          ),
                        v >= 3 &&
                          e.jsxDEV(
                            "p",
                            {
                              className: "text-sm text-muted-foreground mt-2",
                              children: [
                                "Multiple payment attempts failed. Please try a different payment method or",
                                " ",
                                e.jsxDEV(
                                  g,
                                  {
                                    href: "/contact",
                                    className: "underline",
                                    children: "contact support",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                    lineNumber: 217,
                                    columnNumber: 17,
                                  },
                                  void 0,
                                ),
                                ".",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                              lineNumber: 215,
                              columnNumber: 15,
                            },
                            void 0,
                          ),
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                      lineNumber: 200,
                      columnNumber: 11,
                    },
                    void 0,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                lineNumber: 197,
                columnNumber: 9,
              },
              void 0,
            ),
          e.jsxDEV(
            "div",
            {
              className: "bg-gray-50 dark:bg-gray-800 p-4 rounded-lg",
              children: e.jsxDEV(
                Z,
                {
                  options: {
                    layout: "tabs",
                    paymentMethodOrder: ["card", "apple_pay", "google_pay"],
                  },
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                  lineNumber: 225,
                  columnNumber: 9,
                },
                void 0,
              ),
            },
            void 0,
            !1,
            {
              fileName: "/home/runner/workspace/client/src/pages/Subscribe.tsx",
              lineNumber: 224,
              columnNumber: 7,
            },
            void 0,
          ),
          e.jsxDEV(
            "div",
            {
              className:
                "flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400",
              children: [
                e.jsxDEV(
                  U,
                  { className: "h-4 w-4" },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                    lineNumber: 234,
                    columnNumber: 9,
                  },
                  void 0,
                ),
                e.jsxDEV(
                  "span",
                  {
                    children:
                      "Your payment information is secure and encrypted",
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                    lineNumber: 235,
                    columnNumber: 9,
                  },
                  void 0,
                ),
              ],
            },
            void 0,
            !0,
            {
              fileName: "/home/runner/workspace/client/src/pages/Subscribe.tsx",
              lineNumber: 233,
              columnNumber: 7,
            },
            void 0,
          ),
          e.jsxDEV(
            d,
            {
              type: "submit",
              className: "w-full py-3 text-lg gradient-bg",
              disabled: !s || m,
              "data-testid": "button-submit-payment",
              children: m
                ? e.jsxDEV(
                    e.Fragment,
                    {
                      children: [
                        e.jsxDEV(
                          ee,
                          { className: "w-4 h-4 mr-2 animate-spin" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                            lineNumber: 246,
                            columnNumber: 13,
                          },
                          void 0,
                        ),
                        "Processing Payment...",
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                      lineNumber: 245,
                      columnNumber: 11,
                    },
                    void 0,
                  )
                : e.jsxDEV(
                    e.Fragment,
                    {
                      children: [
                        e.jsxDEV(
                          re,
                          { className: "h-5 w-5 mr-2" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                            lineNumber: 251,
                            columnNumber: 13,
                          },
                          void 0,
                        ),
                        i.period === "once"
                          ? `Pay $${i.price} Once`
                          : `Subscribe for $${i.price}/${i.period}`,
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                      lineNumber: 250,
                      columnNumber: 11,
                    },
                    void 0,
                  ),
            },
            void 0,
            !1,
            {
              fileName: "/home/runner/workspace/client/src/pages/Subscribe.tsx",
              lineNumber: 238,
              columnNumber: 7,
            },
            void 0,
          ),
          e.jsxDEV(
            "p",
            {
              className: "text-xs text-gray-500 dark:text-gray-400 text-center",
              children: [
                "By subscribing, you agree to our Terms of Service and Privacy Policy.",
                i.period !== "once" && " You can cancel anytime.",
              ],
            },
            void 0,
            !0,
            {
              fileName: "/home/runner/workspace/client/src/pages/Subscribe.tsx",
              lineNumber: 259,
              columnNumber: 7,
            },
            void 0,
          ),
        ],
      },
      void 0,
      !0,
      {
        fileName: "/home/runner/workspace/client/src/pages/Subscribe.tsx",
        lineNumber: 195,
        columnNumber: 5,
      },
      void 0,
    );
  },
  O = () =>
    e.jsxDEV(
      "div",
      {
        className:
          "min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4",
        children: e.jsxDEV(
          h,
          {
            className: "max-w-md",
            children: e.jsxDEV(
              f,
              {
                className: "p-8 text-center",
                children: [
                  e.jsxDEV(
                    K,
                    { className: "h-16 w-16 text-orange-500 mx-auto mb-4" },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                      lineNumber: 271,
                      columnNumber: 9,
                    },
                    void 0,
                  ),
                  e.jsxDEV(
                    "h1",
                    {
                      className:
                        "text-2xl font-bold text-gray-900 dark:text-white mb-4",
                      children: "Payment Service Unavailable",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                      lineNumber: 272,
                      columnNumber: 9,
                    },
                    void 0,
                  ),
                  e.jsxDEV(
                    "p",
                    {
                      className: "text-gray-600 dark:text-gray-400 mb-6",
                      children:
                        "Our payment processing service is temporarily unavailable. This is usually resolved within a few minutes.",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                      lineNumber: 273,
                      columnNumber: 9,
                    },
                    void 0,
                  ),
                  e.jsxDEV(
                    "div",
                    {
                      className: "space-y-3",
                      children: [
                        e.jsxDEV(
                          d,
                          {
                            onClick: () => window.location.reload(),
                            className: "w-full",
                            children: [
                              e.jsxDEV(
                                V,
                                { className: "h-4 w-4 mr-2" },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                  lineNumber: 278,
                                  columnNumber: 13,
                                },
                                void 0,
                              ),
                              "Try Again",
                            ],
                          },
                          void 0,
                          !0,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                            lineNumber: 277,
                            columnNumber: 11,
                          },
                          void 0,
                        ),
                        e.jsxDEV(
                          g,
                          {
                            href: "/pricing",
                            children: e.jsxDEV(
                              d,
                              {
                                variant: "outline",
                                className: "w-full",
                                children: "Back to Pricing",
                              },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                lineNumber: 282,
                                columnNumber: 13,
                              },
                              void 0,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                            lineNumber: 281,
                            columnNumber: 11,
                          },
                          void 0,
                        ),
                      ],
                    },
                    void 0,
                    !0,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                      lineNumber: 276,
                      columnNumber: 9,
                    },
                    void 0,
                  ),
                  e.jsxDEV(
                    "p",
                    {
                      className:
                        "text-xs text-gray-500 dark:text-gray-500 mt-6",
                      children:
                        "If this issue persists, please contact support at support@maxbooster.com",
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                      lineNumber: 287,
                      columnNumber: 9,
                    },
                    void 0,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                lineNumber: 270,
                columnNumber: 7,
              },
              void 0,
            ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Subscribe.tsx",
            lineNumber: 269,
            columnNumber: 5,
          },
          void 0,
        ),
      },
      void 0,
      !1,
      {
        fileName: "/home/runner/workspace/client/src/pages/Subscribe.tsx",
        lineNumber: 268,
        columnNumber: 3,
      },
      void 0,
    );
function Ce() {
  const { tier: i } = W(),
    { user: r } = se(),
    [s, t] = b.useState(""),
    [n, l] = b.useState(!0),
    [m, u] = b.useState(null),
    [p, N] = b.useState(0),
    { toast: v } = M(),
    [, y] = F(),
    a = ye[i],
    x = b.useCallback(async () => {
      if (a) {
        (l(!0), u(null));
        try {
          const c = await (
            await te("POST", "/api/create-subscription", { planName: a.id })
          ).json();
          if (c.code === "STRIPE_NOT_CONFIGURED") {
            u({
              message: "Payment service is temporarily unavailable.",
              code: "STRIPE_NOT_CONFIGURED",
              retryable: !1,
            });
            return;
          }
          t(c.clientSecret);
        } catch (o) {
          const c = o.body || o;
          c.code === "STRIPE_NOT_CONFIGURED" || o.status === 503
            ? u({
                message:
                  "Payment service is temporarily unavailable. Please try again later.",
                code: "STRIPE_NOT_CONFIGURED",
                retryable: !1,
              })
            : (u({
                message:
                  c.message || "Failed to setup payment. Please try again.",
                code: c.code || "SETUP_FAILED",
                retryable: c.retryable ?? !0,
              }),
              v({
                title: "Setup Failed",
                description:
                  c.message || "Failed to setup payment. Please try again.",
                variant: "destructive",
              }));
        } finally {
          l(!1);
        }
      }
    }, [a, v]);
  b.useEffect(() => {
    if (!r) {
      y("/login");
      return;
    }
    if (!a) {
      y("/pricing");
      return;
    }
    x();
  }, [r, a, y, x]);
  const S = b.useCallback(() => {
    (N((o) => o + 1), x());
  }, [x]);
  return T
    ? r
      ? a
        ? n
          ? e.jsxDEV(
              "div",
              {
                className:
                  "min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center",
                children: e.jsxDEV(
                  h,
                  {
                    className: "max-w-md mx-4",
                    children: e.jsxDEV(
                      f,
                      {
                        className: "p-8 text-center",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              className:
                                "animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                              lineNumber: 410,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "h2",
                            {
                              className:
                                "text-lg font-semibold text-gray-900 dark:text-white mb-2",
                              children: "Setting up your subscription...",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                              lineNumber: 411,
                              columnNumber: 13,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "p",
                            {
                              className: "text-gray-600",
                              children:
                                "Please wait while we prepare your payment.",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                              lineNumber: 414,
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
                          "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                        lineNumber: 409,
                        columnNumber: 11,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                    lineNumber: 408,
                    columnNumber: 9,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                lineNumber: 407,
                columnNumber: 7,
              },
              this,
            )
          : m
            ? m.code === "STRIPE_NOT_CONFIGURED"
              ? e.jsxDEV(
                  O,
                  {},
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                    lineNumber: 423,
                    columnNumber: 14,
                  },
                  this,
                )
              : e.jsxDEV(
                  "div",
                  {
                    className:
                      "min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4",
                    children: e.jsxDEV(
                      h,
                      {
                        className: "max-w-md",
                        children: e.jsxDEV(
                          f,
                          {
                            className: "p-8 text-center",
                            children: [
                              e.jsxDEV(
                                P,
                                {
                                  className:
                                    "h-16 w-16 text-red-500 mx-auto mb-4",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                  lineNumber: 430,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "h1",
                                {
                                  className:
                                    "text-2xl font-bold text-gray-900 dark:text-white mb-4",
                                  children: "Setup Error",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                  lineNumber: 431,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "p",
                                {
                                  className:
                                    "text-gray-600 dark:text-gray-400 mb-6",
                                  children: m.message,
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                  lineNumber: 432,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-3",
                                  children: [
                                    m.retryable &&
                                      p < 3 &&
                                      e.jsxDEV(
                                        d,
                                        {
                                          onClick: S,
                                          className: "w-full",
                                          children: [
                                            e.jsxDEV(
                                              V,
                                              { className: "h-4 w-4 mr-2" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                lineNumber: 436,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            "Try Again",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                          lineNumber: 435,
                                          columnNumber: 17,
                                        },
                                        this,
                                      ),
                                    e.jsxDEV(
                                      g,
                                      {
                                        href: "/pricing",
                                        children: e.jsxDEV(
                                          d,
                                          {
                                            variant: "outline",
                                            className: "w-full",
                                            children: "Back to Pricing",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                            lineNumber: 441,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                        lineNumber: 440,
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
                                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                  lineNumber: 433,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              p >= 3 &&
                                e.jsxDEV(
                                  "p",
                                  {
                                    className:
                                      "text-xs text-gray-500 dark:text-gray-500 mt-4",
                                    children:
                                      "Multiple attempts failed. Please try again later or contact support.",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                    lineNumber: 445,
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
                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                            lineNumber: 429,
                            columnNumber: 11,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                        lineNumber: 428,
                        columnNumber: 9,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                    lineNumber: 427,
                    columnNumber: 7,
                  },
                  this,
                )
            : s
              ? e.jsxDEV(
                  "div",
                  {
                    className:
                      "min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800",
                    children: [
                      e.jsxDEV(
                        "nav",
                        {
                          className:
                            "sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700",
                          children: e.jsxDEV(
                            "div",
                            {
                              className:
                                "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8",
                              children: e.jsxDEV(
                                "div",
                                {
                                  className:
                                    "flex justify-between items-center h-16",
                                  children: [
                                    e.jsxDEV(
                                      g,
                                      {
                                        href: "/pricing",
                                        children: e.jsxDEV(
                                          d,
                                          {
                                            variant: "ghost",
                                            className:
                                              "flex items-center space-x-2",
                                            children: [
                                              e.jsxDEV(
                                                J,
                                                { className: "h-4 w-4" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                  lineNumber: 488,
                                                  columnNumber: 17,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                ce,
                                                { size: "sm" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                  lineNumber: 489,
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
                                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                            lineNumber: 487,
                                            columnNumber: 15,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                        lineNumber: 486,
                                        columnNumber: 13,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "flex items-center space-x-4",
                                        children: e.jsxDEV(
                                          "span",
                                          {
                                            className: "text-sm text-gray-600",
                                            children: [
                                              "Signed in as ",
                                              e.jsxDEV(
                                                "span",
                                                {
                                                  className: "font-medium",
                                                  children: r.username,
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                  lineNumber: 494,
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
                                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                            lineNumber: 493,
                                            columnNumber: 15,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                        lineNumber: 492,
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
                                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                  lineNumber: 485,
                                  columnNumber: 11,
                                },
                                this,
                              ),
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                              lineNumber: 484,
                              columnNumber: 9,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                          lineNumber: 483,
                          columnNumber: 7,
                        },
                        this,
                      ),
                      e.jsxDEV(
                        "div",
                        {
                          className:
                            "max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8",
                          children: e.jsxDEV(
                            "div",
                            {
                              className:
                                "grid grid-cols-1 lg:grid-cols-2 gap-8",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    children: e.jsxDEV(
                                      h,
                                      {
                                        children: [
                                          e.jsxDEV(
                                            C,
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "flex items-center space-x-3",
                                                    children: [
                                                      e.jsxDEV(
                                                        I,
                                                        {
                                                          className:
                                                            "bg-primary/10 text-primary",
                                                          children: "Subscribe",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                          lineNumber: 508,
                                                          columnNumber: 19,
                                                        },
                                                        this,
                                                      ),
                                                      a.id === "yearly" &&
                                                        e.jsxDEV(
                                                          I,
                                                          {
                                                            className:
                                                              "bg-green-100 text-green-800",
                                                            children:
                                                              "Most Popular",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                            lineNumber: 510,
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
                                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                    lineNumber: 507,
                                                    columnNumber: 17,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  _,
                                                  {
                                                    className: "text-2xl",
                                                    children: a.name,
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                    lineNumber: 513,
                                                    columnNumber: 17,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "flex items-baseline space-x-2",
                                                    children: [
                                                      e.jsxDEV(
                                                        "span",
                                                        {
                                                          className:
                                                            "text-4xl font-bold text-gray-900",
                                                          children: [
                                                            "$",
                                                            a.price,
                                                          ],
                                                        },
                                                        void 0,
                                                        !0,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                          lineNumber: 515,
                                                          columnNumber: 19,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        "span",
                                                        {
                                                          className:
                                                            "text-gray-500",
                                                          children: [
                                                            "/",
                                                            a.period,
                                                          ],
                                                        },
                                                        void 0,
                                                        !0,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                          lineNumber: 516,
                                                          columnNumber: 19,
                                                        },
                                                        this,
                                                      ),
                                                      a.originalPrice &&
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "text-sm text-gray-500 line-through ml-2",
                                                            children: [
                                                              "$",
                                                              a.originalPrice,
                                                              "/",
                                                              a.period,
                                                            ],
                                                          },
                                                          void 0,
                                                          !0,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                            lineNumber: 518,
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
                                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                    lineNumber: 514,
                                                    columnNumber: 17,
                                                  },
                                                  this,
                                                ),
                                                a.id === "yearly" &&
                                                  e.jsxDEV(
                                                    "p",
                                                    {
                                                      className:
                                                        "text-green-600 font-medium",
                                                      children: [
                                                        "Save $",
                                                        120,
                                                        "/year with annual billing",
                                                      ],
                                                    },
                                                    void 0,
                                                    !0,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                      lineNumber: 524,
                                                      columnNumber: 19,
                                                    },
                                                    this,
                                                  ),
                                                e.jsxDEV(
                                                  "p",
                                                  {
                                                    className: "text-gray-600",
                                                    children: a.description,
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                    lineNumber: 528,
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
                                                "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                              lineNumber: 506,
                                              columnNumber: 15,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            f,
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className: "space-y-3",
                                                    children: [
                                                      e.jsxDEV(
                                                        "h4",
                                                        {
                                                          className:
                                                            "font-medium text-gray-900",
                                                          children:
                                                            "What's included:",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                          lineNumber: 532,
                                                          columnNumber: 19,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        "ul",
                                                        {
                                                          className:
                                                            "space-y-2",
                                                          children:
                                                            a.features.map(
                                                              (o, c) =>
                                                                e.jsxDEV(
                                                                  "li",
                                                                  {
                                                                    className:
                                                                      "flex items-start space-x-3",
                                                                    children: [
                                                                      e.jsxDEV(
                                                                        X,
                                                                        {
                                                                          className:
                                                                            "h-5 w-5 text-green-500 mt-0.5 flex-shrink-0",
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                                          lineNumber: 536,
                                                                          columnNumber: 25,
                                                                        },
                                                                        this,
                                                                      ),
                                                                      e.jsxDEV(
                                                                        "span",
                                                                        {
                                                                          className:
                                                                            "text-gray-700",
                                                                          children:
                                                                            o,
                                                                        },
                                                                        void 0,
                                                                        !1,
                                                                        {
                                                                          fileName:
                                                                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                                          lineNumber: 537,
                                                                          columnNumber: 25,
                                                                        },
                                                                        this,
                                                                      ),
                                                                    ],
                                                                  },
                                                                  c,
                                                                  !0,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                                    lineNumber: 535,
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
                                                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                          lineNumber: 533,
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
                                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                    lineNumber: 531,
                                                    columnNumber: 17,
                                                  },
                                                  this,
                                                ),
                                                a.period !== "once" &&
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "mt-6 p-4 bg-blue-50 rounded-lg",
                                                      children: [
                                                        e.jsxDEV(
                                                          "h4",
                                                          {
                                                            className:
                                                              "font-medium text-blue-900 mb-2",
                                                            children:
                                                              "Billing Information",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                            lineNumber: 545,
                                                            columnNumber: 21,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "p",
                                                          {
                                                            className:
                                                              "text-sm text-blue-700",
                                                            children:
                                                              a.id === "yearly"
                                                                ? `You'll be charged $${a.price * 12} today, then $${a.price * 12} every year.`
                                                                : `You'll be charged $${a.price} today, then $${a.price} every month.`,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                            lineNumber: 546,
                                                            columnNumber: 21,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "p",
                                                          {
                                                            className:
                                                              "text-xs text-blue-600 mt-2",
                                                            children:
                                                              "You can cancel your subscription at any time from your account settings.",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                            lineNumber: 551,
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
                                                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                      lineNumber: 544,
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
                                                "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                              lineNumber: 530,
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
                                          "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                        lineNumber: 505,
                                        columnNumber: 13,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                    lineNumber: 504,
                                    columnNumber: 11,
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
                                          children: [
                                            e.jsxDEV(
                                              C,
                                              {
                                                children: [
                                                  e.jsxDEV(
                                                    _,
                                                    {
                                                      children:
                                                        "Complete Your Subscription",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                      lineNumber: 564,
                                                      columnNumber: 17,
                                                    },
                                                    this,
                                                  ),
                                                  e.jsxDEV(
                                                    "p",
                                                    {
                                                      className:
                                                        "text-gray-600",
                                                      children:
                                                        "Enter your payment details to start your Max Booster journey.",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
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
                                                  "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                lineNumber: 563,
                                                columnNumber: 15,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              f,
                                              {
                                                children: e.jsxDEV(
                                                  z,
                                                  {
                                                    stripe: T,
                                                    options: {
                                                      clientSecret: s,
                                                    },
                                                    children: e.jsxDEV(
                                                      Se,
                                                      { plan: a, onRetry: S },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                        lineNumber: 571,
                                                        columnNumber: 19,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                    lineNumber: 570,
                                                    columnNumber: 17,
                                                  },
                                                  this,
                                                ),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                lineNumber: 569,
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
                                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                          lineNumber: 562,
                                          columnNumber: 13,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "mt-6 p-4 bg-gray-50 rounded-lg",
                                          children: e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "flex items-start space-x-3",
                                              children: [
                                                e.jsxDEV(
                                                  U,
                                                  {
                                                    className:
                                                      "h-5 w-5 text-gray-400 mt-0.5",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                    lineNumber: 579,
                                                    columnNumber: 17,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "text-sm text-gray-600",
                                                    children: [
                                                      e.jsxDEV(
                                                        "h4",
                                                        {
                                                          className:
                                                            "font-medium text-gray-900 mb-1",
                                                          children:
                                                            "Secure Payment",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                          lineNumber: 581,
                                                          columnNumber: 19,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        "p",
                                                        {
                                                          children:
                                                            "Your payment is processed securely by Stripe. We never store your credit card information. All transactions are encrypted and protected.",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                          lineNumber: 582,
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
                                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                                    lineNumber: 580,
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
                                                "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                              lineNumber: 578,
                                              columnNumber: 15,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                          lineNumber: 577,
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
                                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                    lineNumber: 561,
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
                                "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                              lineNumber: 502,
                              columnNumber: 9,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                          lineNumber: 501,
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
                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                    lineNumber: 481,
                    columnNumber: 5,
                  },
                  this,
                )
              : e.jsxDEV(
                  "div",
                  {
                    className:
                      "min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4",
                    children: e.jsxDEV(
                      h,
                      {
                        className: "max-w-md",
                        children: e.jsxDEV(
                          f,
                          {
                            className: "p-8 text-center",
                            children: [
                              e.jsxDEV(
                                P,
                                {
                                  className:
                                    "h-16 w-16 text-orange-500 mx-auto mb-4",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                  lineNumber: 460,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "h1",
                                {
                                  className:
                                    "text-2xl font-bold text-gray-900 dark:text-white mb-4",
                                  children: "Setup Error",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                  lineNumber: 461,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "p",
                                {
                                  className:
                                    "text-gray-600 dark:text-gray-400 mb-6",
                                  children:
                                    "We couldn't set up your subscription. Please try again.",
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                  lineNumber: 462,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-3",
                                  children: [
                                    e.jsxDEV(
                                      d,
                                      {
                                        onClick: S,
                                        className: "w-full",
                                        children: [
                                          e.jsxDEV(
                                            V,
                                            { className: "h-4 w-4 mr-2" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                              lineNumber: 467,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          "Try Again",
                                        ],
                                      },
                                      void 0,
                                      !0,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                        lineNumber: 466,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      g,
                                      {
                                        href: "/pricing",
                                        children: e.jsxDEV(
                                          d,
                                          {
                                            variant: "outline",
                                            className: "w-full",
                                            children: "Back to Pricing",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                            lineNumber: 471,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                        lineNumber: 470,
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
                                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                  lineNumber: 465,
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
                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                            lineNumber: 459,
                            columnNumber: 11,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                        lineNumber: 458,
                        columnNumber: 9,
                      },
                      this,
                    ),
                  },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                    lineNumber: 457,
                    columnNumber: 7,
                  },
                  this,
                )
        : e.jsxDEV(
            "div",
            {
              className:
                "min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center",
              children: e.jsxDEV(
                h,
                {
                  className: "max-w-md mx-4",
                  children: e.jsxDEV(
                    f,
                    {
                      className: "p-8 text-center",
                      children: [
                        e.jsxDEV(
                          "h1",
                          {
                            className:
                              "text-2xl font-bold text-gray-900 dark:text-white mb-4",
                            children: "Plan Not Found",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                            lineNumber: 392,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "p",
                          {
                            className: "text-gray-600 mb-6",
                            children:
                              "The subscription plan you're looking for doesn't exist.",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                            lineNumber: 393,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          g,
                          {
                            href: "/pricing",
                            children: e.jsxDEV(
                              d,
                              { children: "View Available Plans" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                                lineNumber: 397,
                                columnNumber: 15,
                              },
                              this,
                            ),
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                            lineNumber: 396,
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
                        "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                      lineNumber: 391,
                      columnNumber: 11,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                  lineNumber: 390,
                  columnNumber: 9,
                },
                this,
              ),
            },
            void 0,
            !1,
            {
              fileName: "/home/runner/workspace/client/src/pages/Subscribe.tsx",
              lineNumber: 389,
              columnNumber: 7,
            },
            this,
          )
      : e.jsxDEV(
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
                fileName:
                  "/home/runner/workspace/client/src/pages/Subscribe.tsx",
                lineNumber: 382,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Subscribe.tsx",
            lineNumber: 381,
            columnNumber: 7,
          },
          this,
        )
    : e.jsxDEV(
        O,
        {},
        void 0,
        !1,
        {
          fileName: "/home/runner/workspace/client/src/pages/Subscribe.tsx",
          lineNumber: 376,
          columnNumber: 12,
        },
        this,
      );
}
export { Ce as default };
