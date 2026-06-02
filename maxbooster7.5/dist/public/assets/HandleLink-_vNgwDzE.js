import { ag as c, r as l, f as n } from "./vendor-react-31oK5L0i.js";
import { l as m } from "./studio-DOUfHW5v.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./vendor-animation-CFQslDag.js";
const d = {
  dashboard: "/dashboard",
  studio: "/studio",
  distribution: "/distribution",
  marketplace: "/marketplace",
  analytics: "/analytics",
  settings: "/settings",
  profile: "/profile",
};
function x() {
  const [, e] = c();
  return (
    l.useEffect(() => {
      const a = new URLSearchParams(window.location.search).get("url");
      if (a)
        try {
          const r = a.replace(/^(web\+)?maxbooster:\/\//, ""),
            [o, ...s] = r.split("/"),
            t = d[o];
          if (t) {
            const i = s.length > 0 ? `${t}/${s.join("/")}` : t;
            e(i);
            return;
          }
        } catch (r) {
          m.error("[HandleLink] Failed to parse deep link:", r);
        }
      e("/dashboard");
    }, [e]),
    n.jsxDEV(
      "div",
      {
        className:
          "min-h-screen flex items-center justify-center bg-background",
        children: n.jsxDEV(
          "div",
          {
            className:
              "animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full",
          },
          void 0,
          !1,
          {
            fileName: "/home/runner/workspace/client/src/pages/HandleLink.tsx",
            lineNumber: 45,
            columnNumber: 7,
          },
          this,
        ),
      },
      void 0,
      !1,
      {
        fileName: "/home/runner/workspace/client/src/pages/HandleLink.tsx",
        lineNumber: 44,
        columnNumber: 5,
      },
      this,
    )
  );
}
export { x as default };
