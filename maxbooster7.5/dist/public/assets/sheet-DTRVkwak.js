import {
  a7 as f,
  a8 as p,
  r as n,
  f as e,
  a9 as h,
  aa as i,
  ab as N,
  ac as b,
  ad as r,
  ae as l,
  af as d,
} from "./vendor-react-31oK5L0i.js";
import { d as x } from "./vendor-ui-Ds7F22HT.js";
import { b as o } from "./studio-DOUfHW5v.js";
const S = f,
  R = p,
  g = h,
  m = n.forwardRef(({ className: t, ...s }, a) =>
    e.jsxDEV(
      d,
      {
        className: o(
          "fixed inset-0 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          t,
        ),
        style: { zIndex: 9998 },
        ...s,
        ref: a,
      },
      void 0,
      !1,
      {
        fileName: "/home/runner/workspace/client/src/components/ui/sheet.tsx",
        lineNumber: 22,
        columnNumber: 3,
      },
      void 0,
    ),
  );
m.displayName = d.displayName;
const y = x(
    "fixed gap-4 bg-white dark:bg-gray-900 p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
    {
      variants: {
        side: {
          top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          bottom:
            "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
          right:
            "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
        },
      },
      defaultVariants: { side: "right" },
    },
  ),
  w = n.forwardRef(
    ({ side: t = "right", className: s, children: a, ...c }, u) =>
      e.jsxDEV(
        g,
        {
          children: [
            e.jsxDEV(
              m,
              {},
              void 0,
              !1,
              {
                fileName:
                  "/home/runner/workspace/client/src/components/ui/sheet.tsx",
                lineNumber: 62,
                columnNumber: 5,
              },
              void 0,
            ),
            e.jsxDEV(
              i,
              {
                ref: u,
                className: o(y({ side: t }), s),
                style: { zIndex: 9999, pointerEvents: "auto" },
                ...c,
                children: [
                  a,
                  e.jsxDEV(
                    N,
                    {
                      className:
                        "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary",
                      children: [
                        e.jsxDEV(
                          b,
                          { className: "h-4 w-4" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/ui/sheet.tsx",
                            lineNumber: 66,
                            columnNumber: 9,
                          },
                          void 0,
                        ),
                        e.jsxDEV(
                          "span",
                          { className: "sr-only", children: "Close" },
                          void 0,
                          !1,
                          {
                            fileName:
                              "/home/runner/workspace/client/src/components/ui/sheet.tsx",
                            lineNumber: 67,
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
                        "/home/runner/workspace/client/src/components/ui/sheet.tsx",
                      lineNumber: 65,
                      columnNumber: 7,
                    },
                    void 0,
                  ),
                ],
              },
              void 0,
              !0,
              {
                fileName:
                  "/home/runner/workspace/client/src/components/ui/sheet.tsx",
                lineNumber: 63,
                columnNumber: 5,
              },
              void 0,
            ),
          ],
        },
        void 0,
        !0,
        {
          fileName: "/home/runner/workspace/client/src/components/ui/sheet.tsx",
          lineNumber: 61,
          columnNumber: 3,
        },
        void 0,
      ),
  );
w.displayName = i.displayName;
const v = ({ className: t, ...s }) =>
  e.jsxDEV(
    "div",
    {
      className: o("flex flex-col space-y-2 text-center sm:text-left", t),
      ...s,
    },
    void 0,
    !1,
    {
      fileName: "/home/runner/workspace/client/src/components/ui/sheet.tsx",
      lineNumber: 75,
      columnNumber: 3,
    },
    void 0,
  );
v.displayName = "SheetHeader";
const k = n.forwardRef(({ className: t, ...s }, a) =>
  e.jsxDEV(
    r,
    { ref: a, className: o("text-lg font-semibold text-foreground", t), ...s },
    void 0,
    !1,
    {
      fileName: "/home/runner/workspace/client/src/components/ui/sheet.tsx",
      lineNumber: 91,
      columnNumber: 3,
    },
    void 0,
  ),
);
k.displayName = r.displayName;
const D = n.forwardRef(({ className: t, ...s }, a) =>
  e.jsxDEV(
    l,
    { ref: a, className: o("text-sm text-muted-foreground", t), ...s },
    void 0,
    !1,
    {
      fileName: "/home/runner/workspace/client/src/components/ui/sheet.tsx",
      lineNumber: 103,
      columnNumber: 3,
    },
    void 0,
  ),
);
D.displayName = l.displayName;
export { S, R as a, w as b, v as c, k as d, D as e };
