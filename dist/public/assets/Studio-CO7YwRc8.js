import { dd as o, r as a, f as e, ap as l } from "./vendor-react-31oK5L0i.js";
import { a as n } from "./useRequireAuth-K5x5riUd.js";
import { A as r } from "./AppLayout-D2pri0rw.js";
import { aa as u, ab as m } from "./studio-DOUfHW5v.js";
import { E as c } from "./index-D5xLbTBZ.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./TopBar-jcH3P98k.js";
import "./vendor-animation-CFQslDag.js";
function v() {
  const { user: i, isLoading: s } = n(),
    t = o().projectId || null;
  return (
    a.useEffect(() => {
      u.midi.initialize();
    }, []),
    s
      ? e.jsxDEV(
          r,
          {
            noPadding: !0,
            title: "Studio",
            children: e.jsxDEV(
              "div",
              {
                className:
                  "h-full w-full flex items-center justify-center bg-slate-950",
                children: e.jsxDEV(
                  l,
                  { className: "w-8 h-8 animate-spin text-emerald-500" },
                  void 0,
                  !1,
                  {
                    fileName:
                      "/home/runner/workspace/client/src/pages/Studio.tsx",
                    lineNumber: 23,
                    columnNumber: 11,
                  },
                  this,
                ),
              },
              void 0,
              !1,
              {
                fileName: "/home/runner/workspace/client/src/pages/Studio.tsx",
                lineNumber: 22,
                columnNumber: 9,
              },
              this,
            ),
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/Studio.tsx",
            lineNumber: 21,
            columnNumber: 7,
          },
          this,
        )
      : i
        ? e.jsxDEV(
            r,
            {
              noPadding: !0,
              title: "Studio",
              children: e.jsxDEV(
                "div",
                {
                  className: "h-full w-full relative",
                  children: e.jsxDEV(
                    c,
                    {
                      children: e.jsxDEV(
                        m,
                        { projectId: t },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/Studio.tsx",
                          lineNumber: 37,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    },
                    void 0,
                    !1,
                    {
                      fileName:
                        "/home/runner/workspace/client/src/pages/Studio.tsx",
                      lineNumber: 36,
                      columnNumber: 9,
                    },
                    this,
                  ),
                },
                void 0,
                !1,
                {
                  fileName:
                    "/home/runner/workspace/client/src/pages/Studio.tsx",
                  lineNumber: 35,
                  columnNumber: 7,
                },
                this,
              ),
            },
            void 0,
            !1,
            {
              fileName: "/home/runner/workspace/client/src/pages/Studio.tsx",
              lineNumber: 34,
              columnNumber: 5,
            },
            this,
          )
        : null
  );
}
export { v as default };
