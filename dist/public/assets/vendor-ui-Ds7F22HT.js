function So(e, t, { checkForDefaultPrevented: o = !0 } = {}) {
  return function (a) {
    if ((e?.(a), o === !1 || !a.defaultPrevented)) return t?.(a);
  };
}
function we(e) {
  var t,
    o,
    r = "";
  if (typeof e == "string" || typeof e == "number") r += e;
  else if (typeof e == "object")
    if (Array.isArray(e)) {
      var a = e.length;
      for (t = 0; t < a; t++)
        e[t] && (o = we(e[t])) && (r && (r += " "), (r += o));
    } else for (o in e) e[o] && (r && (r += " "), (r += o));
  return r;
}
function je() {
  for (var e, t, o = 0, r = "", a = arguments.length; o < a; o++)
    (e = arguments[o]) && (t = we(e)) && (r && (r += " "), (r += t));
  return r;
}
const Ee = (e, t) => {
    const o = new Array(e.length + t.length);
    for (let r = 0; r < e.length; r++) o[r] = e[r];
    for (let r = 0; r < t.length; r++) o[e.length + r] = t[r];
    return o;
  },
  Le = (e, t) => ({ classGroupId: e, validator: t }),
  ve = (e = new Map(), t = null, o) => ({
    nextPart: e,
    validators: t,
    classGroupId: o,
  }),
  K = "-",
  pe = [],
  We = "arbitrary..",
  Fe = (e) => {
    const t = Be(e),
      { conflictingClassGroups: o, conflictingClassGroupModifiers: r } = e;
    return {
      getClassGroupId: (i) => {
        if (i.startsWith("[") && i.endsWith("]")) return _e(i);
        const f = i.split(K),
          c = f[0] === "" && f.length > 1 ? 1 : 0;
        return ze(f, c, t);
      },
      getConflictingClassGroupIds: (i, f) => {
        if (f) {
          const c = r[i],
            p = o[i];
          return c ? (p ? Ee(p, c) : c) : p || pe;
        }
        return o[i] || pe;
      },
    };
  },
  ze = (e, t, o) => {
    if (e.length - t === 0) return o.classGroupId;
    const a = e[t],
      l = o.nextPart.get(a);
    if (l) {
      const p = ze(e, t + 1, l);
      if (p) return p;
    }
    const i = o.validators;
    if (i === null) return;
    const f = t === 0 ? e.join(K) : e.slice(t).join(K),
      c = i.length;
    for (let p = 0; p < c; p++) {
      const b = i[p];
      if (b.validator(f)) return b.classGroupId;
    }
  },
  _e = (e) =>
    e.slice(1, -1).indexOf(":") === -1
      ? void 0
      : (() => {
          const t = e.slice(1, -1),
            o = t.indexOf(":"),
            r = t.slice(0, o);
          return r ? We + r : void 0;
        })(),
  Be = (e) => {
    const { theme: t, classGroups: o } = e;
    return $e(o, t);
  },
  $e = (e, t) => {
    const o = ve();
    for (const r in e) {
      const a = e[r];
      te(a, o, r, t);
    }
    return o;
  },
  te = (e, t, o, r) => {
    const a = e.length;
    for (let l = 0; l < a; l++) {
      const i = e[l];
      Ue(i, t, o, r);
    }
  },
  Ue = (e, t, o, r) => {
    if (typeof e == "string") {
      De(e, t, o);
      return;
    }
    if (typeof e == "function") {
      Ye(e, t, o, r);
      return;
    }
    qe(e, t, o, r);
  },
  De = (e, t, o) => {
    const r = e === "" ? t : Ce(t, e);
    r.classGroupId = o;
  },
  Ye = (e, t, o, r) => {
    if (Xe(e)) {
      te(e(r), t, o, r);
      return;
    }
    (t.validators === null && (t.validators = []), t.validators.push(Le(o, e)));
  },
  qe = (e, t, o, r) => {
    const a = Object.entries(e),
      l = a.length;
    for (let i = 0; i < l; i++) {
      const [f, c] = a[i];
      te(c, Ce(t, f), o, r);
    }
  },
  Ce = (e, t) => {
    let o = e;
    const r = t.split(K),
      a = r.length;
    for (let l = 0; l < a; l++) {
      const i = r[l];
      let f = o.nextPart.get(i);
      (f || ((f = ve()), o.nextPart.set(i, f)), (o = f));
    }
    return o;
  },
  Xe = (e) => "isThemeGetter" in e && e.isThemeGetter === !0,
  He = (e) => {
    if (e < 1) return { get: () => {}, set: () => {} };
    let t = 0,
      o = Object.create(null),
      r = Object.create(null);
    const a = (l, i) => {
      ((o[l] = i), t++, t > e && ((t = 0), (r = o), (o = Object.create(null))));
    };
    return {
      get(l) {
        let i = o[l];
        if (i !== void 0) return i;
        if ((i = r[l]) !== void 0) return (a(l, i), i);
      },
      set(l, i) {
        l in o ? (o[l] = i) : a(l, i);
      },
    };
  },
  re = "!",
  fe = ":",
  Je = [],
  be = (e, t, o, r, a) => ({
    modifiers: e,
    hasImportantModifier: t,
    baseClassName: o,
    maybePostfixModifierPosition: r,
    isExternal: a,
  }),
  Ke = (e) => {
    const { prefix: t, experimentalParseClassName: o } = e;
    let r = (a) => {
      const l = [];
      let i = 0,
        f = 0,
        c = 0,
        p;
      const b = a.length;
      for (let v = 0; v < b; v++) {
        const k = a[v];
        if (i === 0 && f === 0) {
          if (k === fe) {
            (l.push(a.slice(c, v)), (c = v + 1));
            continue;
          }
          if (k === "/") {
            p = v;
            continue;
          }
        }
        k === "[" ? i++ : k === "]" ? i-- : k === "(" ? f++ : k === ")" && f--;
      }
      const x = l.length === 0 ? a : a.slice(c);
      let y = x,
        C = !1;
      x.endsWith(re)
        ? ((y = x.slice(0, -1)), (C = !0))
        : x.startsWith(re) && ((y = x.slice(1)), (C = !0));
      const A = p && p > c ? p - c : void 0;
      return be(l, C, y, A);
    };
    if (t) {
      const a = t + fe,
        l = r;
      r = (i) =>
        i.startsWith(a) ? l(i.slice(a.length)) : be(Je, !1, i, void 0, !0);
    }
    if (o) {
      const a = r;
      r = (l) => o({ className: l, parseClassName: a });
    }
    return r;
  },
  Qe = (e) => {
    const t = new Map();
    return (
      e.orderSensitiveModifiers.forEach((o, r) => {
        t.set(o, 1e6 + r);
      }),
      (o) => {
        const r = [];
        let a = [];
        for (let l = 0; l < o.length; l++) {
          const i = o[l],
            f = i[0] === "[",
            c = t.has(i);
          f || c
            ? (a.length > 0 && (a.sort(), r.push(...a), (a = [])), r.push(i))
            : a.push(i);
        }
        return (a.length > 0 && (a.sort(), r.push(...a)), r);
      }
    );
  },
  Ze = (e) => ({
    cache: He(e.cacheSize),
    parseClassName: Ke(e),
    sortModifiers: Qe(e),
    ...Fe(e),
  }),
  eo = /\s+/,
  oo = (e, t) => {
    const {
        parseClassName: o,
        getClassGroupId: r,
        getConflictingClassGroupIds: a,
        sortModifiers: l,
      } = t,
      i = [],
      f = e.trim().split(eo);
    let c = "";
    for (let p = f.length - 1; p >= 0; p -= 1) {
      const b = f[p],
        {
          isExternal: x,
          modifiers: y,
          hasImportantModifier: C,
          baseClassName: A,
          maybePostfixModifierPosition: v,
        } = o(b);
      if (x) {
        c = b + (c.length > 0 ? " " + c : c);
        continue;
      }
      let k = !!v,
        G = r(k ? A.substring(0, v) : A);
      if (!G) {
        if (!k) {
          c = b + (c.length > 0 ? " " + c : c);
          continue;
        }
        if (((G = r(A)), !G)) {
          c = b + (c.length > 0 ? " " + c : c);
          continue;
        }
        k = !1;
      }
      const $ = y.length === 0 ? "" : y.length === 1 ? y[0] : l(y).join(":"),
        F = C ? $ + re : $,
        j = F + G;
      if (i.indexOf(j) > -1) continue;
      i.push(j);
      const E = a(G, k);
      for (let T = 0; T < E.length; ++T) {
        const _ = E[T];
        i.push(F + _);
      }
      c = b + (c.length > 0 ? " " + c : c);
    }
    return c;
  },
  ro = (...e) => {
    let t = 0,
      o,
      r,
      a = "";
    for (; t < e.length; )
      (o = e[t++]) && (r = Ae(o)) && (a && (a += " "), (a += r));
    return a;
  },
  Ae = (e) => {
    if (typeof e == "string") return e;
    let t,
      o = "";
    for (let r = 0; r < e.length; r++)
      e[r] && (t = Ae(e[r])) && (o && (o += " "), (o += t));
    return o;
  },
  to = (e, ...t) => {
    let o, r, a, l;
    const i = (c) => {
        const p = t.reduce((b, x) => x(b), e());
        return (
          (o = Ze(p)),
          (r = o.cache.get),
          (a = o.cache.set),
          (l = f),
          f(c)
        );
      },
      f = (c) => {
        const p = r(c);
        if (p) return p;
        const b = oo(c, o);
        return (a(c, b), b);
      };
    return ((l = i), (...c) => l(ro(...c)));
  },
  so = [],
  g = (e) => {
    const t = (o) => o[e] || so;
    return ((t.isThemeGetter = !0), t);
  },
  Se = /^\[(?:(\w[\w-]*):)?(.+)\]$/i,
  Re = /^\((?:(\w[\w-]*):)?(.+)\)$/i,
  no = /^\d+\/\d+$/,
  ao = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,
  io =
    /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,
  lo = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,
  co = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,
  mo =
    /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,
  W = (e) => no.test(e),
  u = (e) => !!e && !Number.isNaN(Number(e)),
  I = (e) => !!e && Number.isInteger(Number(e)),
  oe = (e) => e.endsWith("%") && u(e.slice(0, -1)),
  M = (e) => ao.test(e),
  Me = () => !0,
  uo = (e) => io.test(e) && !lo.test(e),
  se = () => !1,
  po = (e) => co.test(e),
  fo = (e) => mo.test(e),
  bo = (e) => !s(e) && !n(e),
  go = (e) => P(e, Ge, se),
  s = (e) => Se.test(e),
  O = (e) => P(e, Te, uo),
  ge = (e) => P(e, Co, u),
  ho = (e) => P(e, Oe, Me),
  xo = (e) => P(e, Ne, se),
  he = (e) => P(e, Ie, se),
  yo = (e) => P(e, Pe, fo),
  H = (e) => P(e, Ve, po),
  n = (e) => Re.test(e),
  B = (e) => V(e, Te),
  ko = (e) => V(e, Ne),
  xe = (e) => V(e, Ie),
  wo = (e) => V(e, Ge),
  vo = (e) => V(e, Pe),
  J = (e) => V(e, Ve, !0),
  zo = (e) => V(e, Oe, !0),
  P = (e, t, o) => {
    const r = Se.exec(e);
    return r ? (r[1] ? t(r[1]) : o(r[2])) : !1;
  },
  V = (e, t, o = !1) => {
    const r = Re.exec(e);
    return r ? (r[1] ? t(r[1]) : o) : !1;
  },
  Ie = (e) => e === "position" || e === "percentage",
  Pe = (e) => e === "image" || e === "url",
  Ge = (e) => e === "length" || e === "size" || e === "bg-size",
  Te = (e) => e === "length",
  Co = (e) => e === "number",
  Ne = (e) => e === "family-name",
  Oe = (e) => e === "number" || e === "weight",
  Ve = (e) => e === "shadow",
  Ao = () => {
    const e = g("color"),
      t = g("font"),
      o = g("text"),
      r = g("font-weight"),
      a = g("tracking"),
      l = g("leading"),
      i = g("breakpoint"),
      f = g("container"),
      c = g("spacing"),
      p = g("radius"),
      b = g("shadow"),
      x = g("inset-shadow"),
      y = g("text-shadow"),
      C = g("drop-shadow"),
      A = g("blur"),
      v = g("perspective"),
      k = g("aspect"),
      G = g("ease"),
      $ = g("animate"),
      F = () => [
        "auto",
        "avoid",
        "all",
        "avoid-page",
        "page",
        "left",
        "right",
        "column",
      ],
      j = () => [
        "center",
        "top",
        "bottom",
        "left",
        "right",
        "top-left",
        "left-top",
        "top-right",
        "right-top",
        "bottom-right",
        "right-bottom",
        "bottom-left",
        "left-bottom",
      ],
      E = () => [...j(), n, s],
      T = () => ["auto", "hidden", "clip", "visible", "scroll"],
      _ = () => ["auto", "contain", "none"],
      m = () => [n, s, c],
      S = () => [W, "full", "auto", ...m()],
      ne = () => [I, "none", "subgrid", n, s],
      ae = () => ["auto", { span: ["full", I, n, s] }, I, n, s],
      U = () => [I, "auto", n, s],
      ie = () => ["auto", "min", "max", "fr", n, s],
      Q = () => [
        "start",
        "end",
        "center",
        "between",
        "around",
        "evenly",
        "stretch",
        "baseline",
        "center-safe",
        "end-safe",
      ],
      L = () => [
        "start",
        "end",
        "center",
        "stretch",
        "center-safe",
        "end-safe",
      ],
      R = () => ["auto", ...m()],
      N = () => [
        W,
        "auto",
        "full",
        "dvw",
        "dvh",
        "lvw",
        "lvh",
        "svw",
        "svh",
        "min",
        "max",
        "fit",
        ...m(),
      ],
      d = () => [e, n, s],
      le = () => [...j(), xe, he, { position: [n, s] }],
      ce = () => ["no-repeat", { repeat: ["", "x", "y", "space", "round"] }],
      de = () => ["auto", "cover", "contain", wo, go, { size: [n, s] }],
      Z = () => [oe, B, O],
      w = () => ["", "none", "full", p, n, s],
      z = () => ["", u, B, O],
      D = () => ["solid", "dashed", "dotted", "double"],
      me = () => [
        "normal",
        "multiply",
        "screen",
        "overlay",
        "darken",
        "lighten",
        "color-dodge",
        "color-burn",
        "hard-light",
        "soft-light",
        "difference",
        "exclusion",
        "hue",
        "saturation",
        "color",
        "luminosity",
      ],
      h = () => [u, oe, xe, he],
      ue = () => ["", "none", A, n, s],
      Y = () => ["none", u, n, s],
      q = () => ["none", u, n, s],
      ee = () => [u, n, s],
      X = () => [W, "full", ...m()];
    return {
      cacheSize: 500,
      theme: {
        animate: ["spin", "ping", "pulse", "bounce"],
        aspect: ["video"],
        blur: [M],
        breakpoint: [M],
        color: [Me],
        container: [M],
        "drop-shadow": [M],
        ease: ["in", "out", "in-out"],
        font: [bo],
        "font-weight": [
          "thin",
          "extralight",
          "light",
          "normal",
          "medium",
          "semibold",
          "bold",
          "extrabold",
          "black",
        ],
        "inset-shadow": [M],
        leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
        perspective: [
          "dramatic",
          "near",
          "normal",
          "midrange",
          "distant",
          "none",
        ],
        radius: [M],
        shadow: [M],
        spacing: ["px", u],
        text: [M],
        "text-shadow": [M],
        tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"],
      },
      classGroups: {
        aspect: [{ aspect: ["auto", "square", W, s, n, k] }],
        container: ["container"],
        columns: [{ columns: [u, s, n, f] }],
        "break-after": [{ "break-after": F() }],
        "break-before": [{ "break-before": F() }],
        "break-inside": [
          { "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"] },
        ],
        "box-decoration": [{ "box-decoration": ["slice", "clone"] }],
        box: [{ box: ["border", "content"] }],
        display: [
          "block",
          "inline-block",
          "inline",
          "flex",
          "inline-flex",
          "table",
          "inline-table",
          "table-caption",
          "table-cell",
          "table-column",
          "table-column-group",
          "table-footer-group",
          "table-header-group",
          "table-row-group",
          "table-row",
          "flow-root",
          "grid",
          "inline-grid",
          "contents",
          "list-item",
          "hidden",
        ],
        sr: ["sr-only", "not-sr-only"],
        float: [{ float: ["right", "left", "none", "start", "end"] }],
        clear: [{ clear: ["left", "right", "both", "none", "start", "end"] }],
        isolation: ["isolate", "isolation-auto"],
        "object-fit": [
          { object: ["contain", "cover", "fill", "none", "scale-down"] },
        ],
        "object-position": [{ object: E() }],
        overflow: [{ overflow: T() }],
        "overflow-x": [{ "overflow-x": T() }],
        "overflow-y": [{ "overflow-y": T() }],
        overscroll: [{ overscroll: _() }],
        "overscroll-x": [{ "overscroll-x": _() }],
        "overscroll-y": [{ "overscroll-y": _() }],
        position: ["static", "fixed", "absolute", "relative", "sticky"],
        inset: [{ inset: S() }],
        "inset-x": [{ "inset-x": S() }],
        "inset-y": [{ "inset-y": S() }],
        start: [{ start: S() }],
        end: [{ end: S() }],
        top: [{ top: S() }],
        right: [{ right: S() }],
        bottom: [{ bottom: S() }],
        left: [{ left: S() }],
        visibility: ["visible", "invisible", "collapse"],
        z: [{ z: [I, "auto", n, s] }],
        basis: [{ basis: [W, "full", "auto", f, ...m()] }],
        "flex-direction": [
          { flex: ["row", "row-reverse", "col", "col-reverse"] },
        ],
        "flex-wrap": [{ flex: ["nowrap", "wrap", "wrap-reverse"] }],
        flex: [{ flex: [u, W, "auto", "initial", "none", s] }],
        grow: [{ grow: ["", u, n, s] }],
        shrink: [{ shrink: ["", u, n, s] }],
        order: [{ order: [I, "first", "last", "none", n, s] }],
        "grid-cols": [{ "grid-cols": ne() }],
        "col-start-end": [{ col: ae() }],
        "col-start": [{ "col-start": U() }],
        "col-end": [{ "col-end": U() }],
        "grid-rows": [{ "grid-rows": ne() }],
        "row-start-end": [{ row: ae() }],
        "row-start": [{ "row-start": U() }],
        "row-end": [{ "row-end": U() }],
        "grid-flow": [
          { "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"] },
        ],
        "auto-cols": [{ "auto-cols": ie() }],
        "auto-rows": [{ "auto-rows": ie() }],
        gap: [{ gap: m() }],
        "gap-x": [{ "gap-x": m() }],
        "gap-y": [{ "gap-y": m() }],
        "justify-content": [{ justify: [...Q(), "normal"] }],
        "justify-items": [{ "justify-items": [...L(), "normal"] }],
        "justify-self": [{ "justify-self": ["auto", ...L()] }],
        "align-content": [{ content: ["normal", ...Q()] }],
        "align-items": [{ items: [...L(), { baseline: ["", "last"] }] }],
        "align-self": [{ self: ["auto", ...L(), { baseline: ["", "last"] }] }],
        "place-content": [{ "place-content": Q() }],
        "place-items": [{ "place-items": [...L(), "baseline"] }],
        "place-self": [{ "place-self": ["auto", ...L()] }],
        p: [{ p: m() }],
        px: [{ px: m() }],
        py: [{ py: m() }],
        ps: [{ ps: m() }],
        pe: [{ pe: m() }],
        pt: [{ pt: m() }],
        pr: [{ pr: m() }],
        pb: [{ pb: m() }],
        pl: [{ pl: m() }],
        m: [{ m: R() }],
        mx: [{ mx: R() }],
        my: [{ my: R() }],
        ms: [{ ms: R() }],
        me: [{ me: R() }],
        mt: [{ mt: R() }],
        mr: [{ mr: R() }],
        mb: [{ mb: R() }],
        ml: [{ ml: R() }],
        "space-x": [{ "space-x": m() }],
        "space-x-reverse": ["space-x-reverse"],
        "space-y": [{ "space-y": m() }],
        "space-y-reverse": ["space-y-reverse"],
        size: [{ size: N() }],
        w: [{ w: [f, "screen", ...N()] }],
        "min-w": [{ "min-w": [f, "screen", "none", ...N()] }],
        "max-w": [
          { "max-w": [f, "screen", "none", "prose", { screen: [i] }, ...N()] },
        ],
        h: [{ h: ["screen", "lh", ...N()] }],
        "min-h": [{ "min-h": ["screen", "lh", "none", ...N()] }],
        "max-h": [{ "max-h": ["screen", "lh", ...N()] }],
        "font-size": [{ text: ["base", o, B, O] }],
        "font-smoothing": ["antialiased", "subpixel-antialiased"],
        "font-style": ["italic", "not-italic"],
        "font-weight": [{ font: [r, zo, ho] }],
        "font-stretch": [
          {
            "font-stretch": [
              "ultra-condensed",
              "extra-condensed",
              "condensed",
              "semi-condensed",
              "normal",
              "semi-expanded",
              "expanded",
              "extra-expanded",
              "ultra-expanded",
              oe,
              s,
            ],
          },
        ],
        "font-family": [{ font: [ko, xo, t] }],
        "fvn-normal": ["normal-nums"],
        "fvn-ordinal": ["ordinal"],
        "fvn-slashed-zero": ["slashed-zero"],
        "fvn-figure": ["lining-nums", "oldstyle-nums"],
        "fvn-spacing": ["proportional-nums", "tabular-nums"],
        "fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
        tracking: [{ tracking: [a, n, s] }],
        "line-clamp": [{ "line-clamp": [u, "none", n, ge] }],
        leading: [{ leading: [l, ...m()] }],
        "list-image": [{ "list-image": ["none", n, s] }],
        "list-style-position": [{ list: ["inside", "outside"] }],
        "list-style-type": [{ list: ["disc", "decimal", "none", n, s] }],
        "text-alignment": [
          { text: ["left", "center", "right", "justify", "start", "end"] },
        ],
        "placeholder-color": [{ placeholder: d() }],
        "text-color": [{ text: d() }],
        "text-decoration": [
          "underline",
          "overline",
          "line-through",
          "no-underline",
        ],
        "text-decoration-style": [{ decoration: [...D(), "wavy"] }],
        "text-decoration-thickness": [
          { decoration: [u, "from-font", "auto", n, O] },
        ],
        "text-decoration-color": [{ decoration: d() }],
        "underline-offset": [{ "underline-offset": [u, "auto", n, s] }],
        "text-transform": [
          "uppercase",
          "lowercase",
          "capitalize",
          "normal-case",
        ],
        "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
        "text-wrap": [{ text: ["wrap", "nowrap", "balance", "pretty"] }],
        indent: [{ indent: m() }],
        "vertical-align": [
          {
            align: [
              "baseline",
              "top",
              "middle",
              "bottom",
              "text-top",
              "text-bottom",
              "sub",
              "super",
              n,
              s,
            ],
          },
        ],
        whitespace: [
          {
            whitespace: [
              "normal",
              "nowrap",
              "pre",
              "pre-line",
              "pre-wrap",
              "break-spaces",
            ],
          },
        ],
        break: [{ break: ["normal", "words", "all", "keep"] }],
        wrap: [{ wrap: ["break-word", "anywhere", "normal"] }],
        hyphens: [{ hyphens: ["none", "manual", "auto"] }],
        content: [{ content: ["none", n, s] }],
        "bg-attachment": [{ bg: ["fixed", "local", "scroll"] }],
        "bg-clip": [{ "bg-clip": ["border", "padding", "content", "text"] }],
        "bg-origin": [{ "bg-origin": ["border", "padding", "content"] }],
        "bg-position": [{ bg: le() }],
        "bg-repeat": [{ bg: ce() }],
        "bg-size": [{ bg: de() }],
        "bg-image": [
          {
            bg: [
              "none",
              {
                linear: [
                  { to: ["t", "tr", "r", "br", "b", "bl", "l", "tl"] },
                  I,
                  n,
                  s,
                ],
                radial: ["", n, s],
                conic: [I, n, s],
              },
              vo,
              yo,
            ],
          },
        ],
        "bg-color": [{ bg: d() }],
        "gradient-from-pos": [{ from: Z() }],
        "gradient-via-pos": [{ via: Z() }],
        "gradient-to-pos": [{ to: Z() }],
        "gradient-from": [{ from: d() }],
        "gradient-via": [{ via: d() }],
        "gradient-to": [{ to: d() }],
        rounded: [{ rounded: w() }],
        "rounded-s": [{ "rounded-s": w() }],
        "rounded-e": [{ "rounded-e": w() }],
        "rounded-t": [{ "rounded-t": w() }],
        "rounded-r": [{ "rounded-r": w() }],
        "rounded-b": [{ "rounded-b": w() }],
        "rounded-l": [{ "rounded-l": w() }],
        "rounded-ss": [{ "rounded-ss": w() }],
        "rounded-se": [{ "rounded-se": w() }],
        "rounded-ee": [{ "rounded-ee": w() }],
        "rounded-es": [{ "rounded-es": w() }],
        "rounded-tl": [{ "rounded-tl": w() }],
        "rounded-tr": [{ "rounded-tr": w() }],
        "rounded-br": [{ "rounded-br": w() }],
        "rounded-bl": [{ "rounded-bl": w() }],
        "border-w": [{ border: z() }],
        "border-w-x": [{ "border-x": z() }],
        "border-w-y": [{ "border-y": z() }],
        "border-w-s": [{ "border-s": z() }],
        "border-w-e": [{ "border-e": z() }],
        "border-w-t": [{ "border-t": z() }],
        "border-w-r": [{ "border-r": z() }],
        "border-w-b": [{ "border-b": z() }],
        "border-w-l": [{ "border-l": z() }],
        "divide-x": [{ "divide-x": z() }],
        "divide-x-reverse": ["divide-x-reverse"],
        "divide-y": [{ "divide-y": z() }],
        "divide-y-reverse": ["divide-y-reverse"],
        "border-style": [{ border: [...D(), "hidden", "none"] }],
        "divide-style": [{ divide: [...D(), "hidden", "none"] }],
        "border-color": [{ border: d() }],
        "border-color-x": [{ "border-x": d() }],
        "border-color-y": [{ "border-y": d() }],
        "border-color-s": [{ "border-s": d() }],
        "border-color-e": [{ "border-e": d() }],
        "border-color-t": [{ "border-t": d() }],
        "border-color-r": [{ "border-r": d() }],
        "border-color-b": [{ "border-b": d() }],
        "border-color-l": [{ "border-l": d() }],
        "divide-color": [{ divide: d() }],
        "outline-style": [{ outline: [...D(), "none", "hidden"] }],
        "outline-offset": [{ "outline-offset": [u, n, s] }],
        "outline-w": [{ outline: ["", u, B, O] }],
        "outline-color": [{ outline: d() }],
        shadow: [{ shadow: ["", "none", b, J, H] }],
        "shadow-color": [{ shadow: d() }],
        "inset-shadow": [{ "inset-shadow": ["none", x, J, H] }],
        "inset-shadow-color": [{ "inset-shadow": d() }],
        "ring-w": [{ ring: z() }],
        "ring-w-inset": ["ring-inset"],
        "ring-color": [{ ring: d() }],
        "ring-offset-w": [{ "ring-offset": [u, O] }],
        "ring-offset-color": [{ "ring-offset": d() }],
        "inset-ring-w": [{ "inset-ring": z() }],
        "inset-ring-color": [{ "inset-ring": d() }],
        "text-shadow": [{ "text-shadow": ["none", y, J, H] }],
        "text-shadow-color": [{ "text-shadow": d() }],
        opacity: [{ opacity: [u, n, s] }],
        "mix-blend": [
          { "mix-blend": [...me(), "plus-darker", "plus-lighter"] },
        ],
        "bg-blend": [{ "bg-blend": me() }],
        "mask-clip": [
          {
            "mask-clip": [
              "border",
              "padding",
              "content",
              "fill",
              "stroke",
              "view",
            ],
          },
          "mask-no-clip",
        ],
        "mask-composite": [
          { mask: ["add", "subtract", "intersect", "exclude"] },
        ],
        "mask-image-linear-pos": [{ "mask-linear": [u] }],
        "mask-image-linear-from-pos": [{ "mask-linear-from": h() }],
        "mask-image-linear-to-pos": [{ "mask-linear-to": h() }],
        "mask-image-linear-from-color": [{ "mask-linear-from": d() }],
        "mask-image-linear-to-color": [{ "mask-linear-to": d() }],
        "mask-image-t-from-pos": [{ "mask-t-from": h() }],
        "mask-image-t-to-pos": [{ "mask-t-to": h() }],
        "mask-image-t-from-color": [{ "mask-t-from": d() }],
        "mask-image-t-to-color": [{ "mask-t-to": d() }],
        "mask-image-r-from-pos": [{ "mask-r-from": h() }],
        "mask-image-r-to-pos": [{ "mask-r-to": h() }],
        "mask-image-r-from-color": [{ "mask-r-from": d() }],
        "mask-image-r-to-color": [{ "mask-r-to": d() }],
        "mask-image-b-from-pos": [{ "mask-b-from": h() }],
        "mask-image-b-to-pos": [{ "mask-b-to": h() }],
        "mask-image-b-from-color": [{ "mask-b-from": d() }],
        "mask-image-b-to-color": [{ "mask-b-to": d() }],
        "mask-image-l-from-pos": [{ "mask-l-from": h() }],
        "mask-image-l-to-pos": [{ "mask-l-to": h() }],
        "mask-image-l-from-color": [{ "mask-l-from": d() }],
        "mask-image-l-to-color": [{ "mask-l-to": d() }],
        "mask-image-x-from-pos": [{ "mask-x-from": h() }],
        "mask-image-x-to-pos": [{ "mask-x-to": h() }],
        "mask-image-x-from-color": [{ "mask-x-from": d() }],
        "mask-image-x-to-color": [{ "mask-x-to": d() }],
        "mask-image-y-from-pos": [{ "mask-y-from": h() }],
        "mask-image-y-to-pos": [{ "mask-y-to": h() }],
        "mask-image-y-from-color": [{ "mask-y-from": d() }],
        "mask-image-y-to-color": [{ "mask-y-to": d() }],
        "mask-image-radial": [{ "mask-radial": [n, s] }],
        "mask-image-radial-from-pos": [{ "mask-radial-from": h() }],
        "mask-image-radial-to-pos": [{ "mask-radial-to": h() }],
        "mask-image-radial-from-color": [{ "mask-radial-from": d() }],
        "mask-image-radial-to-color": [{ "mask-radial-to": d() }],
        "mask-image-radial-shape": [{ "mask-radial": ["circle", "ellipse"] }],
        "mask-image-radial-size": [
          {
            "mask-radial": [
              { closest: ["side", "corner"], farthest: ["side", "corner"] },
            ],
          },
        ],
        "mask-image-radial-pos": [{ "mask-radial-at": j() }],
        "mask-image-conic-pos": [{ "mask-conic": [u] }],
        "mask-image-conic-from-pos": [{ "mask-conic-from": h() }],
        "mask-image-conic-to-pos": [{ "mask-conic-to": h() }],
        "mask-image-conic-from-color": [{ "mask-conic-from": d() }],
        "mask-image-conic-to-color": [{ "mask-conic-to": d() }],
        "mask-mode": [{ mask: ["alpha", "luminance", "match"] }],
        "mask-origin": [
          {
            "mask-origin": [
              "border",
              "padding",
              "content",
              "fill",
              "stroke",
              "view",
            ],
          },
        ],
        "mask-position": [{ mask: le() }],
        "mask-repeat": [{ mask: ce() }],
        "mask-size": [{ mask: de() }],
        "mask-type": [{ "mask-type": ["alpha", "luminance"] }],
        "mask-image": [{ mask: ["none", n, s] }],
        filter: [{ filter: ["", "none", n, s] }],
        blur: [{ blur: ue() }],
        brightness: [{ brightness: [u, n, s] }],
        contrast: [{ contrast: [u, n, s] }],
        "drop-shadow": [{ "drop-shadow": ["", "none", C, J, H] }],
        "drop-shadow-color": [{ "drop-shadow": d() }],
        grayscale: [{ grayscale: ["", u, n, s] }],
        "hue-rotate": [{ "hue-rotate": [u, n, s] }],
        invert: [{ invert: ["", u, n, s] }],
        saturate: [{ saturate: [u, n, s] }],
        sepia: [{ sepia: ["", u, n, s] }],
        "backdrop-filter": [{ "backdrop-filter": ["", "none", n, s] }],
        "backdrop-blur": [{ "backdrop-blur": ue() }],
        "backdrop-brightness": [{ "backdrop-brightness": [u, n, s] }],
        "backdrop-contrast": [{ "backdrop-contrast": [u, n, s] }],
        "backdrop-grayscale": [{ "backdrop-grayscale": ["", u, n, s] }],
        "backdrop-hue-rotate": [{ "backdrop-hue-rotate": [u, n, s] }],
        "backdrop-invert": [{ "backdrop-invert": ["", u, n, s] }],
        "backdrop-opacity": [{ "backdrop-opacity": [u, n, s] }],
        "backdrop-saturate": [{ "backdrop-saturate": [u, n, s] }],
        "backdrop-sepia": [{ "backdrop-sepia": ["", u, n, s] }],
        "border-collapse": [{ border: ["collapse", "separate"] }],
        "border-spacing": [{ "border-spacing": m() }],
        "border-spacing-x": [{ "border-spacing-x": m() }],
        "border-spacing-y": [{ "border-spacing-y": m() }],
        "table-layout": [{ table: ["auto", "fixed"] }],
        caption: [{ caption: ["top", "bottom"] }],
        transition: [
          {
            transition: [
              "",
              "all",
              "colors",
              "opacity",
              "shadow",
              "transform",
              "none",
              n,
              s,
            ],
          },
        ],
        "transition-behavior": [{ transition: ["normal", "discrete"] }],
        duration: [{ duration: [u, "initial", n, s] }],
        ease: [{ ease: ["linear", "initial", G, n, s] }],
        delay: [{ delay: [u, n, s] }],
        animate: [{ animate: ["none", $, n, s] }],
        backface: [{ backface: ["hidden", "visible"] }],
        perspective: [{ perspective: [v, n, s] }],
        "perspective-origin": [{ "perspective-origin": E() }],
        rotate: [{ rotate: Y() }],
        "rotate-x": [{ "rotate-x": Y() }],
        "rotate-y": [{ "rotate-y": Y() }],
        "rotate-z": [{ "rotate-z": Y() }],
        scale: [{ scale: q() }],
        "scale-x": [{ "scale-x": q() }],
        "scale-y": [{ "scale-y": q() }],
        "scale-z": [{ "scale-z": q() }],
        "scale-3d": ["scale-3d"],
        skew: [{ skew: ee() }],
        "skew-x": [{ "skew-x": ee() }],
        "skew-y": [{ "skew-y": ee() }],
        transform: [{ transform: [n, s, "", "none", "gpu", "cpu"] }],
        "transform-origin": [{ origin: E() }],
        "transform-style": [{ transform: ["3d", "flat"] }],
        translate: [{ translate: X() }],
        "translate-x": [{ "translate-x": X() }],
        "translate-y": [{ "translate-y": X() }],
        "translate-z": [{ "translate-z": X() }],
        "translate-none": ["translate-none"],
        accent: [{ accent: d() }],
        appearance: [{ appearance: ["none", "auto"] }],
        "caret-color": [{ caret: d() }],
        "color-scheme": [
          {
            scheme: [
              "normal",
              "dark",
              "light",
              "light-dark",
              "only-dark",
              "only-light",
            ],
          },
        ],
        cursor: [
          {
            cursor: [
              "auto",
              "default",
              "pointer",
              "wait",
              "text",
              "move",
              "help",
              "not-allowed",
              "none",
              "context-menu",
              "progress",
              "cell",
              "crosshair",
              "vertical-text",
              "alias",
              "copy",
              "no-drop",
              "grab",
              "grabbing",
              "all-scroll",
              "col-resize",
              "row-resize",
              "n-resize",
              "e-resize",
              "s-resize",
              "w-resize",
              "ne-resize",
              "nw-resize",
              "se-resize",
              "sw-resize",
              "ew-resize",
              "ns-resize",
              "nesw-resize",
              "nwse-resize",
              "zoom-in",
              "zoom-out",
              n,
              s,
            ],
          },
        ],
        "field-sizing": [{ "field-sizing": ["fixed", "content"] }],
        "pointer-events": [{ "pointer-events": ["auto", "none"] }],
        resize: [{ resize: ["none", "", "y", "x"] }],
        "scroll-behavior": [{ scroll: ["auto", "smooth"] }],
        "scroll-m": [{ "scroll-m": m() }],
        "scroll-mx": [{ "scroll-mx": m() }],
        "scroll-my": [{ "scroll-my": m() }],
        "scroll-ms": [{ "scroll-ms": m() }],
        "scroll-me": [{ "scroll-me": m() }],
        "scroll-mt": [{ "scroll-mt": m() }],
        "scroll-mr": [{ "scroll-mr": m() }],
        "scroll-mb": [{ "scroll-mb": m() }],
        "scroll-ml": [{ "scroll-ml": m() }],
        "scroll-p": [{ "scroll-p": m() }],
        "scroll-px": [{ "scroll-px": m() }],
        "scroll-py": [{ "scroll-py": m() }],
        "scroll-ps": [{ "scroll-ps": m() }],
        "scroll-pe": [{ "scroll-pe": m() }],
        "scroll-pt": [{ "scroll-pt": m() }],
        "scroll-pr": [{ "scroll-pr": m() }],
        "scroll-pb": [{ "scroll-pb": m() }],
        "scroll-pl": [{ "scroll-pl": m() }],
        "snap-align": [{ snap: ["start", "end", "center", "align-none"] }],
        "snap-stop": [{ snap: ["normal", "always"] }],
        "snap-type": [{ snap: ["none", "x", "y", "both"] }],
        "snap-strictness": [{ snap: ["mandatory", "proximity"] }],
        touch: [{ touch: ["auto", "none", "manipulation"] }],
        "touch-x": [{ "touch-pan": ["x", "left", "right"] }],
        "touch-y": [{ "touch-pan": ["y", "up", "down"] }],
        "touch-pz": ["touch-pinch-zoom"],
        select: [{ select: ["none", "text", "all", "auto"] }],
        "will-change": [
          { "will-change": ["auto", "scroll", "contents", "transform", n, s] },
        ],
        fill: [{ fill: ["none", ...d()] }],
        "stroke-w": [{ stroke: [u, B, O, ge] }],
        stroke: [{ stroke: ["none", ...d()] }],
        "forced-color-adjust": [{ "forced-color-adjust": ["auto", "none"] }],
      },
      conflictingClassGroups: {
        overflow: ["overflow-x", "overflow-y"],
        overscroll: ["overscroll-x", "overscroll-y"],
        inset: [
          "inset-x",
          "inset-y",
          "start",
          "end",
          "top",
          "right",
          "bottom",
          "left",
        ],
        "inset-x": ["right", "left"],
        "inset-y": ["top", "bottom"],
        flex: ["basis", "grow", "shrink"],
        gap: ["gap-x", "gap-y"],
        p: ["px", "py", "ps", "pe", "pt", "pr", "pb", "pl"],
        px: ["pr", "pl"],
        py: ["pt", "pb"],
        m: ["mx", "my", "ms", "me", "mt", "mr", "mb", "ml"],
        mx: ["mr", "ml"],
        my: ["mt", "mb"],
        size: ["w", "h"],
        "font-size": ["leading"],
        "fvn-normal": [
          "fvn-ordinal",
          "fvn-slashed-zero",
          "fvn-figure",
          "fvn-spacing",
          "fvn-fraction",
        ],
        "fvn-ordinal": ["fvn-normal"],
        "fvn-slashed-zero": ["fvn-normal"],
        "fvn-figure": ["fvn-normal"],
        "fvn-spacing": ["fvn-normal"],
        "fvn-fraction": ["fvn-normal"],
        "line-clamp": ["display", "overflow"],
        rounded: [
          "rounded-s",
          "rounded-e",
          "rounded-t",
          "rounded-r",
          "rounded-b",
          "rounded-l",
          "rounded-ss",
          "rounded-se",
          "rounded-ee",
          "rounded-es",
          "rounded-tl",
          "rounded-tr",
          "rounded-br",
          "rounded-bl",
        ],
        "rounded-s": ["rounded-ss", "rounded-es"],
        "rounded-e": ["rounded-se", "rounded-ee"],
        "rounded-t": ["rounded-tl", "rounded-tr"],
        "rounded-r": ["rounded-tr", "rounded-br"],
        "rounded-b": ["rounded-br", "rounded-bl"],
        "rounded-l": ["rounded-tl", "rounded-bl"],
        "border-spacing": ["border-spacing-x", "border-spacing-y"],
        "border-w": [
          "border-w-x",
          "border-w-y",
          "border-w-s",
          "border-w-e",
          "border-w-t",
          "border-w-r",
          "border-w-b",
          "border-w-l",
        ],
        "border-w-x": ["border-w-r", "border-w-l"],
        "border-w-y": ["border-w-t", "border-w-b"],
        "border-color": [
          "border-color-x",
          "border-color-y",
          "border-color-s",
          "border-color-e",
          "border-color-t",
          "border-color-r",
          "border-color-b",
          "border-color-l",
        ],
        "border-color-x": ["border-color-r", "border-color-l"],
        "border-color-y": ["border-color-t", "border-color-b"],
        translate: ["translate-x", "translate-y", "translate-none"],
        "translate-none": [
          "translate",
          "translate-x",
          "translate-y",
          "translate-z",
        ],
        "scroll-m": [
          "scroll-mx",
          "scroll-my",
          "scroll-ms",
          "scroll-me",
          "scroll-mt",
          "scroll-mr",
          "scroll-mb",
          "scroll-ml",
        ],
        "scroll-mx": ["scroll-mr", "scroll-ml"],
        "scroll-my": ["scroll-mt", "scroll-mb"],
        "scroll-p": [
          "scroll-px",
          "scroll-py",
          "scroll-ps",
          "scroll-pe",
          "scroll-pt",
          "scroll-pr",
          "scroll-pb",
          "scroll-pl",
        ],
        "scroll-px": ["scroll-pr", "scroll-pl"],
        "scroll-py": ["scroll-pt", "scroll-pb"],
        touch: ["touch-x", "touch-y", "touch-pz"],
        "touch-x": ["touch"],
        "touch-y": ["touch"],
        "touch-pz": ["touch"],
      },
      conflictingClassGroupModifiers: { "font-size": ["leading"] },
      orderSensitiveModifiers: [
        "*",
        "**",
        "after",
        "backdrop",
        "before",
        "details-content",
        "file",
        "first-letter",
        "first-line",
        "marker",
        "placeholder",
        "selection",
      ],
    };
  },
  Ro = to(Ao),
  ye = (e) => (typeof e == "boolean" ? `${e}` : e === 0 ? "0" : e),
  ke = je,
  Mo = (e, t) => (o) => {
    var r;
    if (t?.variants == null) return ke(e, o?.class, o?.className);
    const { variants: a, defaultVariants: l } = t,
      i = Object.keys(a).map((p) => {
        const b = o?.[p],
          x = l?.[p];
        if (b === null) return null;
        const y = ye(b) || ye(x);
        return a[p][y];
      }),
      f =
        o &&
        Object.entries(o).reduce((p, b) => {
          let [x, y] = b;
          return (y === void 0 || (p[x] = y), p);
        }, {}),
      c =
        t == null || (r = t.compoundVariants) === null || r === void 0
          ? void 0
          : r.reduce((p, b) => {
              let { class: x, className: y, ...C } = b;
              return Object.entries(C).every((A) => {
                let [v, k] = A;
                return Array.isArray(k)
                  ? k.includes({ ...l, ...f }[v])
                  : { ...l, ...f }[v] === k;
              })
                ? [...p, x, y]
                : p;
            }, []);
    return ke(e, i, c, o?.class, o?.className);
  };
function Io(e, [t, o]) {
  return Math.min(o, Math.max(t, e));
}
export { Io as a, je as b, So as c, Mo as d, Ro as t };
