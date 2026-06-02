import {
  r as s,
  aI as b,
  f as e,
  bc as v,
  ac as f,
} from "./vendor-react-31oK5L0i.js";
import { y, j as a, a as S } from "./studio-DOUfHW5v.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
function D({ triggerContext: c = "30_day", onDismiss: i, onSubmit: u }) {
  const [n, l] = s.useState("score"),
    [t, N] = s.useState(null),
    [m, d] = s.useState(""),
    o = b({
      mutationFn: (r) => S("POST", "/api/retention/nps", r),
      onSuccess: () => {
        (l("thanks"), setTimeout(u, 2500));
      },
    }),
    x = (r) => {
      (N(r), l("comment"));
    },
    h = () => {
      t !== null &&
        o.mutate({ score: t, comment: m.trim() || void 0, triggerContext: c });
    },
    p = (r) =>
      r >= 9
        ? "Extremely likely"
        : r >= 7
          ? "Somewhat likely"
          : r >= 5
            ? "Neutral"
            : "Not likely";
  return e.jsxDEV(
    "div",
    {
      className:
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4",
      children: e.jsxDEV(
        "div",
        {
          className:
            "bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden",
          children: [
            e.jsxDEV(
              "div",
              {
                className: "flex items-center justify-between px-5 pt-4 pb-2",
                children: [
                  e.jsxDEV(
                    "div",
                    {
                      className: "flex items-center gap-2",
                      children: [
                        e.jsxDEV(
                          v,
                          { className: "w-4 h-4 text-purple-600" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                            lineNumber: 58,
                            columnNumber: 13,
                          },
                          this,
                        ),
                        e.jsxDEV(
                          "span",
                          {
                            className:
                              "text-sm font-semibold text-gray-800 dark:text-gray-100",
                            children: "Quick question",
                          },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                            lineNumber: 59,
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
                        "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                      lineNumber: 57,
                      columnNumber: 11,
                    },
                    this,
                  ),
                  e.jsxDEV(
                    "button",
                    {
                      onClick: i,
                      className:
                        "text-gray-400 hover:text-gray-600 transition-colors",
                      "aria-label": "Dismiss survey",
                      children: e.jsxDEV(
                        f,
                        { className: "w-4 h-4" },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                          lineNumber: 66,
                          columnNumber: 13,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                      lineNumber: 61,
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
                  "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                lineNumber: 56,
                columnNumber: 9,
              },
              this,
            ),
            e.jsxDEV(
              "div",
              {
                className: "px-5 pb-5",
                children: [
                  n === "score" &&
                    e.jsxDEV(
                      e.Fragment,
                      {
                        children: [
                          e.jsxDEV(
                            "p",
                            {
                              className:
                                "text-sm text-gray-700 dark:text-gray-300 mb-4",
                              children:
                                "How likely are you to recommend Max Booster to a fellow artist or producer?",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                              lineNumber: 73,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "div",
                            {
                              className:
                                "flex items-center gap-1 justify-between mb-2",
                              children: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
                                (r) =>
                                  e.jsxDEV(
                                    "button",
                                    {
                                      onClick: () => x(r),
                                      className: `w-9 h-9 rounded-lg text-sm font-semibold transition-all border ${r <= 6 ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950" : r <= 8 ? "border-yellow-200 text-yellow-600 hover:bg-yellow-50 dark:border-yellow-700 dark:text-yellow-400 dark:hover:bg-yellow-950" : "border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950"}`,
                                      children: r,
                                    },
                                    r,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                                      lineNumber: 78,
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
                                "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                              lineNumber: 76,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "div",
                            {
                              className:
                                "flex justify-between text-xs text-gray-400 mt-1",
                              children: [
                                e.jsxDEV(
                                  "span",
                                  { children: "Not at all likely" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                                    lineNumber: 94,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "span",
                                  { children: "Extremely likely" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                                    lineNumber: 95,
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
                                "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                              lineNumber: 93,
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
                          "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                        lineNumber: 72,
                        columnNumber: 13,
                      },
                      this,
                    ),
                  n === "comment" &&
                    t !== null &&
                    e.jsxDEV(
                      e.Fragment,
                      {
                        children: [
                          e.jsxDEV(
                            "p",
                            {
                              className:
                                "text-sm text-gray-700 dark:text-gray-300 mb-1",
                              children: [
                                "You selected ",
                                e.jsxDEV(
                                  "span",
                                  {
                                    className: "font-bold text-purple-600",
                                    children: [t, "/10"],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                                    lineNumber: 103,
                                    columnNumber: 30,
                                  },
                                  this,
                                ),
                                " — ",
                                p(t),
                                ".",
                              ],
                            },
                            void 0,
                            !0,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                              lineNumber: 102,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "p",
                            {
                              className:
                                "text-sm text-gray-500 dark:text-gray-400 mb-3",
                              children:
                                t >= 9
                                  ? "That's amazing! What do you love most about Max Booster?"
                                  : t >= 7
                                    ? "Thanks! What could we do to make it even better?"
                                    : "We're sorry to hear that. What's not working for you?",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                              lineNumber: 105,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            y,
                            {
                              value: m,
                              onChange: (r) => d(r.target.value),
                              placeholder: "Share your thoughts (optional)",
                              className: "resize-none text-sm",
                              rows: 3,
                              maxLength: 2e3,
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                              lineNumber: 112,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "div",
                            {
                              className: "flex gap-2 mt-3",
                              children: [
                                e.jsxDEV(
                                  a,
                                  {
                                    onClick: h,
                                    disabled: o.isPending,
                                    size: "sm",
                                    className:
                                      "flex-1 bg-purple-600 hover:bg-purple-700 text-white",
                                    children: o.isPending
                                      ? "Sending…"
                                      : "Submit feedback",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                                    lineNumber: 121,
                                    columnNumber: 17,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  a,
                                  {
                                    variant: "ghost",
                                    size: "sm",
                                    onClick: i,
                                    children: "Skip",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                                    lineNumber: 129,
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
                                "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                              lineNumber: 120,
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
                          "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                        lineNumber: 101,
                        columnNumber: 13,
                      },
                      this,
                    ),
                  n === "thanks" &&
                    e.jsxDEV(
                      "div",
                      {
                        className: "text-center py-2",
                        children: [
                          e.jsxDEV(
                            "p",
                            { className: "text-2xl mb-1", children: "🙏" },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                              lineNumber: 138,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "p",
                            {
                              className:
                                "text-sm font-semibold text-gray-800 dark:text-gray-100",
                              children: "Thank you for your feedback!",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                              lineNumber: 139,
                              columnNumber: 15,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "p",
                            {
                              className:
                                "text-xs text-gray-500 dark:text-gray-400 mt-1",
                              children:
                                "Your response helps us build a better platform for artists.",
                            },
                            void 0,
                            !1,
                            {
                              fileName:
                                "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                              lineNumber: 140,
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
                          "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                        lineNumber: 137,
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
                  "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
                lineNumber: 70,
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
            "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
          lineNumber: 55,
          columnNumber: 7,
        },
        this,
      ),
    },
    void 0,
    !1,
    {
      fileName:
        "/home/runner/workspace/client/src/components/retention/NPSSurvey.tsx",
      lineNumber: 54,
      columnNumber: 5,
    },
    this,
  );
}
export { D as NPSSurvey };
