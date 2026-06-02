const x = typeof __SENTRY_DEBUG__ > "u" || __SENTRY_DEBUG__,
  N = globalThis,
  ue = "10.38.0";
function Te() {
  return (He(N), N);
}
function He(e) {
  const t = (e.__SENTRY__ = e.__SENTRY__ || {});
  return ((t.version = t.version || ue), (t[ue] = t[ue] || {}));
}
function De(e, t, n = N) {
  const r = (n.__SENTRY__ = n.__SENTRY__ || {}),
    o = (r[ue] = r[ue] || {});
  return o[e] || (o[e] = t());
}
const Ru = ["debug", "info", "warn", "error", "log", "assert", "trace"],
  Hn = "Sentry Logger ",
  ut = {};
function Bn(e) {
  if (!("console" in N)) return e();
  const t = N.console,
    n = {},
    r = Object.keys(ut);
  r.forEach((o) => {
    const i = ut[o];
    ((n[o] = t[o]), (t[o] = i));
  });
  try {
    return e();
  } finally {
    r.forEach((o) => {
      t[o] = n[o];
    });
  }
}
function Gn() {
  Ge().enabled = !0;
}
function Xn() {
  Ge().enabled = !1;
}
function qt() {
  return Ge().enabled;
}
function qn(...e) {
  Be("log", ...e);
}
function Kn(...e) {
  Be("warn", ...e);
}
function Qn(...e) {
  Be("error", ...e);
}
function Be(e, ...t) {
  x &&
    qt() &&
    Bn(() => {
      N.console[e](`${Hn}[${e}]:`, ...t);
    });
}
function Ge() {
  return x ? De("loggerSettings", () => ({ enabled: !1 })) : { enabled: !1 };
}
const Y = {
    enable: Gn,
    disable: Xn,
    isEnabled: qt,
    log: qn,
    warn: Kn,
    error: Qn,
  },
  Kt = 50,
  er = "?",
  ft = /\(error: (.*)\)/,
  lt = /captureMessage|captureException/;
function tr(...e) {
  const t = e.sort((n, r) => n[0] - r[0]).map((n) => n[1]);
  return (n, r = 0, o = 0) => {
    const i = [],
      s = n.split(`
`);
    for (let a = r; a < s.length; a++) {
      let c = s[a];
      c.length > 1024 && (c = c.slice(0, 1024));
      const u = ft.test(c) ? c.replace(ft, "$1") : c;
      if (!u.match(/\S*Error: /)) {
        for (const l of t) {
          const d = l(u);
          if (d) {
            i.push(d);
            break;
          }
        }
        if (i.length >= Kt + o) break;
      }
    }
    return nr(i.slice(o));
  };
}
function Lu(e) {
  return Array.isArray(e) ? tr(...e) : e;
}
function nr(e) {
  if (!e.length) return [];
  const t = Array.from(e);
  return (
    /sentryWrapped/.test(me(t).function || "") && t.pop(),
    t.reverse(),
    lt.test(me(t).function || "") &&
      (t.pop(), lt.test(me(t).function || "") && t.pop()),
    t
      .slice(0, Kt)
      .map((n) => ({
        ...n,
        filename: n.filename || me(t).filename,
        function: n.function || er,
      }))
  );
}
function me(e) {
  return e[e.length - 1] || {};
}
const Ce = "<anonymous>";
function Uu(e) {
  try {
    return !e || typeof e != "function" ? Ce : e.name || Ce;
  } catch {
    return Ce;
  }
}
function Yu(e) {
  const t = e.exception;
  if (t) {
    const n = [];
    try {
      return (
        t.values.forEach((r) => {
          r.stacktrace.frames && n.push(...r.stacktrace.frames);
        }),
        n
      );
    } catch {
      return;
    }
  }
}
function rr(e) {
  return "__v_isVNode" in e && e.__v_isVNode ? "[VueVNode]" : "[VueViewModel]";
}
const Qt = Object.prototype.toString;
function or(e) {
  switch (Qt.call(e)) {
    case "[object Error]":
    case "[object Exception]":
    case "[object DOMException]":
    case "[object WebAssembly.Exception]":
      return !0;
    default:
      return he(e, Error);
  }
}
function ee(e, t) {
  return Qt.call(e) === `[object ${t}]`;
}
function Wu(e) {
  return ee(e, "ErrorEvent");
}
function Ju(e) {
  return ee(e, "DOMError");
}
function Vu(e) {
  return ee(e, "DOMException");
}
function Re(e) {
  return ee(e, "String");
}
function sr(e) {
  return (
    typeof e == "object" &&
    e !== null &&
    "__sentry_template_string__" in e &&
    "__sentry_template_values__" in e
  );
}
function Hu(e) {
  return (
    e === null || sr(e) || (typeof e != "object" && typeof e != "function")
  );
}
function en(e) {
  return ee(e, "Object");
}
function ir(e) {
  return typeof Event < "u" && he(e, Event);
}
function ar(e) {
  return typeof Element < "u" && he(e, Element);
}
function cr(e) {
  return ee(e, "RegExp");
}
function ur(e) {
  return !!(e?.then && typeof e.then == "function");
}
function Bu(e) {
  return (
    en(e) &&
    "nativeEvent" in e &&
    "preventDefault" in e &&
    "stopPropagation" in e
  );
}
function he(e, t) {
  try {
    return e instanceof t;
  } catch {
    return !1;
  }
}
function fr(e) {
  return !!(
    typeof e == "object" &&
    e !== null &&
    (e.__isVue || e._isVue || e.__v_isVNode)
  );
}
function Gu(e) {
  return typeof Request < "u" && he(e, Request);
}
const Xe = N,
  lr = 80;
function dr(e, t = {}) {
  if (!e) return "<unknown>";
  try {
    let n = e;
    const r = 5,
      o = [];
    let i = 0,
      s = 0;
    const a = " > ",
      c = a.length;
    let u;
    const l = Array.isArray(t) ? t : t.keyAttrs,
      d = (!Array.isArray(t) && t.maxStringLength) || lr;
    for (
      ;
      n &&
      i++ < r &&
      ((u = hr(n, l)),
      !(u === "html" || (i > 1 && s + o.length * c + u.length >= d)));

    )
      (o.push(u), (s += u.length), (n = n.parentNode));
    return o.reverse().join(a);
  } catch {
    return "<unknown>";
  }
}
function hr(e, t) {
  const n = e,
    r = [];
  if (!n?.tagName) return "";
  if (Xe.HTMLElement && n instanceof HTMLElement && n.dataset) {
    if (n.dataset.sentryComponent) return n.dataset.sentryComponent;
    if (n.dataset.sentryElement) return n.dataset.sentryElement;
  }
  r.push(n.tagName.toLowerCase());
  const o = t?.length
    ? t.filter((s) => n.getAttribute(s)).map((s) => [s, n.getAttribute(s)])
    : null;
  if (o?.length)
    o.forEach((s) => {
      r.push(`[${s[0]}="${s[1]}"]`);
    });
  else {
    n.id && r.push(`#${n.id}`);
    const s = n.className;
    if (s && Re(s)) {
      const a = s.split(/\s+/);
      for (const c of a) r.push(`.${c}`);
    }
  }
  const i = ["aria-label", "type", "name", "title", "alt"];
  for (const s of i) {
    const a = n.getAttribute(s);
    a && r.push(`[${s}="${a}"]`);
  }
  return r.join("");
}
function Xu() {
  try {
    return Xe.document.location.href;
  } catch {
    return "";
  }
}
function qu(e) {
  if (!Xe.HTMLElement) return null;
  let t = e;
  const n = 5;
  for (let r = 0; r < n; r++) {
    if (!t) return null;
    if (t instanceof HTMLElement) {
      if (t.dataset.sentryComponent) return t.dataset.sentryComponent;
      if (t.dataset.sentryElement) return t.dataset.sentryElement;
    }
    t = t.parentNode;
  }
  return null;
}
function Ku(e, t, n) {
  if (!(t in e)) return;
  const r = e[t];
  if (typeof r != "function") return;
  const o = n(r);
  typeof o == "function" && pr(o, r);
  try {
    e[t] = o;
  } catch {
    x && Y.log(`Failed to replace method "${t}" in object`, e);
  }
}
function qe(e, t, n) {
  try {
    Object.defineProperty(e, t, { value: n, writable: !0, configurable: !0 });
  } catch {
    x && Y.log(`Failed to add non-enumerable property "${t}" to object`, e);
  }
}
function pr(e, t) {
  try {
    const n = t.prototype || {};
    ((e.prototype = t.prototype = n), qe(e, "__sentry_original__", t));
  } catch {}
}
function Qu(e) {
  return e.__sentry_original__;
}
function mr(e) {
  if (or(e))
    return { message: e.message, name: e.name, stack: e.stack, ...ht(e) };
  if (ir(e)) {
    const t = {
      type: e.type,
      target: dt(e.target),
      currentTarget: dt(e.currentTarget),
      ...ht(e),
    };
    return (
      typeof CustomEvent < "u" && he(e, CustomEvent) && (t.detail = e.detail),
      t
    );
  } else return e;
}
function dt(e) {
  try {
    return ar(e) ? dr(e) : Object.prototype.toString.call(e);
  } catch {
    return "<unknown>";
  }
}
function ht(e) {
  if (typeof e == "object" && e !== null) {
    const t = {};
    for (const n in e)
      Object.prototype.hasOwnProperty.call(e, n) && (t[n] = e[n]);
    return t;
  } else return {};
}
function ef(e) {
  const t = Object.keys(mr(e));
  return (t.sort(), t[0] ? t.join(", ") : "[object has no keys]");
}
let G;
function Pe(e) {
  if (G !== void 0) return G ? G(e) : e();
  const t = Symbol.for("__SENTRY_SAFE_RANDOM_ID_WRAPPER__"),
    n = N;
  return t in n && typeof n[t] == "function"
    ? ((G = n[t]), G(e))
    : ((G = null), e());
}
function Le() {
  return Pe(() => Math.random());
}
function gr() {
  return Pe(() => Date.now());
}
function _r(e, t = 0) {
  return typeof e != "string" || t === 0 || e.length <= t
    ? e
    : `${e.slice(0, t)}...`;
}
function tf(e, t) {
  if (!Array.isArray(e)) return "";
  const n = [];
  for (let r = 0; r < e.length; r++) {
    const o = e[r];
    try {
      fr(o) ? n.push(rr(o)) : n.push(String(o));
    } catch {
      n.push("[value cannot be serialized]");
    }
  }
  return n.join(t);
}
function yr(e, t, n = !1) {
  return Re(e)
    ? cr(t)
      ? t.test(e)
      : Re(t)
        ? n
          ? e === t
          : e.includes(t)
        : !1
    : !1;
}
function nf(e, t = [], n = !1) {
  return t.some((r) => yr(e, r, n));
}
function br() {
  const e = N;
  return e.crypto || e.msCrypto;
}
let xe;
function wr() {
  return Le() * 16;
}
function W(e = br()) {
  try {
    if (e?.randomUUID) return Pe(() => e.randomUUID()).replace(/-/g, "");
  } catch {}
  return (
    xe || (xe = "10000000100040008000" + 1e11),
    xe.replace(/[018]/g, (t) => (t ^ ((wr() & 15) >> (t / 4))).toString(16))
  );
}
function tn(e) {
  return e.exception?.values?.[0];
}
function rf(e) {
  const { message: t, event_id: n } = e;
  if (t) return t;
  const r = tn(e);
  return r
    ? r.type && r.value
      ? `${r.type}: ${r.value}`
      : r.type || r.value || n || "<unknown>"
    : n || "<unknown>";
}
function of(e, t, n) {
  const r = (e.exception = e.exception || {}),
    o = (r.values = r.values || []),
    i = (o[0] = o[0] || {});
  (i.value || (i.value = t || ""), i.type || (i.type = "Error"));
}
function sf(e, t) {
  const n = tn(e);
  if (!n) return;
  const r = { type: "generic", handled: !0 },
    o = n.mechanism;
  if (((n.mechanism = { ...r, ...o, ...t }), t && "data" in t)) {
    const i = { ...o?.data, ...t.data };
    n.mechanism.data = i;
  }
}
function af(e) {
  if (vr(e)) return !0;
  try {
    qe(e, "__sentry_captured__", !0);
  } catch {}
  return !1;
}
function vr(e) {
  try {
    return e.__sentry_captured__;
  } catch {}
}
const nn = 1e3;
function rn() {
  return gr() / nn;
}
function Sr() {
  const { performance: e } = N;
  if (!e?.now || !e.timeOrigin) return rn;
  const t = e.timeOrigin;
  return () => (t + Pe(() => e.now())) / nn;
}
let pt;
function on() {
  return (pt ?? (pt = Sr()))();
}
function cf(e) {
  const t = on(),
    n = {
      sid: W(),
      init: !0,
      timestamp: t,
      started: t,
      duration: 0,
      status: "ok",
      errors: 0,
      ignoreDuration: !1,
      toJSON: () => kr(n),
    };
  return (e && Ke(n, e), n);
}
function Ke(e, t = {}) {
  if (
    (t.user &&
      (!e.ipAddress && t.user.ip_address && (e.ipAddress = t.user.ip_address),
      !e.did &&
        !t.did &&
        (e.did = t.user.id || t.user.email || t.user.username)),
    (e.timestamp = t.timestamp || on()),
    t.abnormal_mechanism && (e.abnormal_mechanism = t.abnormal_mechanism),
    t.ignoreDuration && (e.ignoreDuration = t.ignoreDuration),
    t.sid && (e.sid = t.sid.length === 32 ? t.sid : W()),
    t.init !== void 0 && (e.init = t.init),
    !e.did && t.did && (e.did = `${t.did}`),
    typeof t.started == "number" && (e.started = t.started),
    e.ignoreDuration)
  )
    e.duration = void 0;
  else if (typeof t.duration == "number") e.duration = t.duration;
  else {
    const n = e.timestamp - e.started;
    e.duration = n >= 0 ? n : 0;
  }
  (t.release && (e.release = t.release),
    t.environment && (e.environment = t.environment),
    !e.ipAddress && t.ipAddress && (e.ipAddress = t.ipAddress),
    !e.userAgent && t.userAgent && (e.userAgent = t.userAgent),
    typeof t.errors == "number" && (e.errors = t.errors),
    t.status && (e.status = t.status));
}
function uf(e, t) {
  let n = {};
  (e.status === "ok" && (n = { status: "exited" }), Ke(e, n));
}
function kr(e) {
  return {
    sid: `${e.sid}`,
    init: e.init,
    started: new Date(e.started * 1e3).toISOString(),
    timestamp: new Date(e.timestamp * 1e3).toISOString(),
    status: e.status,
    errors: e.errors,
    did:
      typeof e.did == "number" || typeof e.did == "string"
        ? `${e.did}`
        : void 0,
    duration: e.duration,
    abnormal_mechanism: e.abnormal_mechanism,
    attrs: {
      release: e.release,
      environment: e.environment,
      ip_address: e.ipAddress,
      user_agent: e.userAgent,
    },
  };
}
function sn(e, t, n = 2) {
  if (!t || typeof t != "object" || n <= 0) return t;
  if (e && Object.keys(t).length === 0) return e;
  const r = { ...e };
  for (const o in t)
    Object.prototype.hasOwnProperty.call(t, o) &&
      (r[o] = sn(r[o], t[o], n - 1));
  return r;
}
function mt() {
  return W();
}
function Or() {
  return W().substring(16);
}
const Ue = "_sentrySpan";
function gt(e, t) {
  t ? qe(e, Ue, t) : delete e[Ue];
}
function _t(e) {
  return e[Ue];
}
const zr = 100;
class F {
  constructor() {
    ((this._notifyingListeners = !1),
      (this._scopeListeners = []),
      (this._eventProcessors = []),
      (this._breadcrumbs = []),
      (this._attachments = []),
      (this._user = {}),
      (this._tags = {}),
      (this._attributes = {}),
      (this._extra = {}),
      (this._contexts = {}),
      (this._sdkProcessingMetadata = {}),
      (this._propagationContext = { traceId: mt(), sampleRand: Le() }));
  }
  clone() {
    const t = new F();
    return (
      (t._breadcrumbs = [...this._breadcrumbs]),
      (t._tags = { ...this._tags }),
      (t._attributes = { ...this._attributes }),
      (t._extra = { ...this._extra }),
      (t._contexts = { ...this._contexts }),
      this._contexts.flags &&
        (t._contexts.flags = { values: [...this._contexts.flags.values] }),
      (t._user = this._user),
      (t._level = this._level),
      (t._session = this._session),
      (t._transactionName = this._transactionName),
      (t._fingerprint = this._fingerprint),
      (t._eventProcessors = [...this._eventProcessors]),
      (t._attachments = [...this._attachments]),
      (t._sdkProcessingMetadata = { ...this._sdkProcessingMetadata }),
      (t._propagationContext = { ...this._propagationContext }),
      (t._client = this._client),
      (t._lastEventId = this._lastEventId),
      (t._conversationId = this._conversationId),
      gt(t, _t(this)),
      t
    );
  }
  setClient(t) {
    this._client = t;
  }
  setLastEventId(t) {
    this._lastEventId = t;
  }
  getClient() {
    return this._client;
  }
  lastEventId() {
    return this._lastEventId;
  }
  addScopeListener(t) {
    this._scopeListeners.push(t);
  }
  addEventProcessor(t) {
    return (this._eventProcessors.push(t), this);
  }
  setUser(t) {
    return (
      (this._user = t || {
        email: void 0,
        id: void 0,
        ip_address: void 0,
        username: void 0,
      }),
      this._session && Ke(this._session, { user: t }),
      this._notifyScopeListeners(),
      this
    );
  }
  getUser() {
    return this._user;
  }
  setConversationId(t) {
    return (
      (this._conversationId = t || void 0),
      this._notifyScopeListeners(),
      this
    );
  }
  setTags(t) {
    return (
      (this._tags = { ...this._tags, ...t }),
      this._notifyScopeListeners(),
      this
    );
  }
  setTag(t, n) {
    return this.setTags({ [t]: n });
  }
  setAttributes(t) {
    return (
      (this._attributes = { ...this._attributes, ...t }),
      this._notifyScopeListeners(),
      this
    );
  }
  setAttribute(t, n) {
    return this.setAttributes({ [t]: n });
  }
  removeAttribute(t) {
    return (
      t in this._attributes &&
        (delete this._attributes[t], this._notifyScopeListeners()),
      this
    );
  }
  setExtras(t) {
    return (
      (this._extra = { ...this._extra, ...t }),
      this._notifyScopeListeners(),
      this
    );
  }
  setExtra(t, n) {
    return (
      (this._extra = { ...this._extra, [t]: n }),
      this._notifyScopeListeners(),
      this
    );
  }
  setFingerprint(t) {
    return ((this._fingerprint = t), this._notifyScopeListeners(), this);
  }
  setLevel(t) {
    return ((this._level = t), this._notifyScopeListeners(), this);
  }
  setTransactionName(t) {
    return ((this._transactionName = t), this._notifyScopeListeners(), this);
  }
  setContext(t, n) {
    return (
      n === null ? delete this._contexts[t] : (this._contexts[t] = n),
      this._notifyScopeListeners(),
      this
    );
  }
  setSession(t) {
    return (
      t ? (this._session = t) : delete this._session,
      this._notifyScopeListeners(),
      this
    );
  }
  getSession() {
    return this._session;
  }
  update(t) {
    if (!t) return this;
    const n = typeof t == "function" ? t(this) : t,
      r = n instanceof F ? n.getScopeData() : en(n) ? t : void 0,
      {
        tags: o,
        attributes: i,
        extra: s,
        user: a,
        contexts: c,
        level: u,
        fingerprint: l = [],
        propagationContext: d,
        conversationId: h,
      } = r || {};
    return (
      (this._tags = { ...this._tags, ...o }),
      (this._attributes = { ...this._attributes, ...i }),
      (this._extra = { ...this._extra, ...s }),
      (this._contexts = { ...this._contexts, ...c }),
      a && Object.keys(a).length && (this._user = a),
      u && (this._level = u),
      l.length && (this._fingerprint = l),
      d && (this._propagationContext = d),
      h && (this._conversationId = h),
      this
    );
  }
  clear() {
    return (
      (this._breadcrumbs = []),
      (this._tags = {}),
      (this._attributes = {}),
      (this._extra = {}),
      (this._user = {}),
      (this._contexts = {}),
      (this._level = void 0),
      (this._transactionName = void 0),
      (this._fingerprint = void 0),
      (this._session = void 0),
      (this._conversationId = void 0),
      gt(this, void 0),
      (this._attachments = []),
      this.setPropagationContext({ traceId: mt(), sampleRand: Le() }),
      this._notifyScopeListeners(),
      this
    );
  }
  addBreadcrumb(t, n) {
    const r = typeof n == "number" ? n : zr;
    if (r <= 0) return this;
    const o = {
      timestamp: rn(),
      ...t,
      message: t.message ? _r(t.message, 2048) : t.message,
    };
    return (
      this._breadcrumbs.push(o),
      this._breadcrumbs.length > r &&
        ((this._breadcrumbs = this._breadcrumbs.slice(-r)),
        this._client?.recordDroppedEvent("buffer_overflow", "log_item")),
      this._notifyScopeListeners(),
      this
    );
  }
  getLastBreadcrumb() {
    return this._breadcrumbs[this._breadcrumbs.length - 1];
  }
  clearBreadcrumbs() {
    return ((this._breadcrumbs = []), this._notifyScopeListeners(), this);
  }
  addAttachment(t) {
    return (this._attachments.push(t), this);
  }
  clearAttachments() {
    return ((this._attachments = []), this);
  }
  getScopeData() {
    return {
      breadcrumbs: this._breadcrumbs,
      attachments: this._attachments,
      contexts: this._contexts,
      tags: this._tags,
      attributes: this._attributes,
      extra: this._extra,
      user: this._user,
      level: this._level,
      fingerprint: this._fingerprint || [],
      eventProcessors: this._eventProcessors,
      propagationContext: this._propagationContext,
      sdkProcessingMetadata: this._sdkProcessingMetadata,
      transactionName: this._transactionName,
      span: _t(this),
      conversationId: this._conversationId,
    };
  }
  setSDKProcessingMetadata(t) {
    return (
      (this._sdkProcessingMetadata = sn(this._sdkProcessingMetadata, t, 2)),
      this
    );
  }
  setPropagationContext(t) {
    return ((this._propagationContext = t), this);
  }
  getPropagationContext() {
    return this._propagationContext;
  }
  captureException(t, n) {
    const r = n?.event_id || W();
    if (!this._client)
      return (
        x &&
          Y.warn("No client configured on scope - will not capture exception!"),
        r
      );
    const o = new Error("Sentry syntheticException");
    return (
      this._client.captureException(
        t,
        { originalException: t, syntheticException: o, ...n, event_id: r },
        this,
      ),
      r
    );
  }
  captureMessage(t, n, r) {
    const o = r?.event_id || W();
    if (!this._client)
      return (
        x &&
          Y.warn("No client configured on scope - will not capture message!"),
        o
      );
    const i = r?.syntheticException ?? new Error(t);
    return (
      this._client.captureMessage(
        t,
        n,
        { originalException: t, syntheticException: i, ...r, event_id: o },
        this,
      ),
      o
    );
  }
  captureEvent(t, n) {
    const r = n?.event_id || W();
    return this._client
      ? (this._client.captureEvent(t, { ...n, event_id: r }, this), r)
      : (x && Y.warn("No client configured on scope - will not capture event!"),
        r);
  }
  _notifyScopeListeners() {
    this._notifyingListeners ||
      ((this._notifyingListeners = !0),
      this._scopeListeners.forEach((t) => {
        t(this);
      }),
      (this._notifyingListeners = !1));
  }
}
function Er() {
  return De("defaultCurrentScope", () => new F());
}
function $r() {
  return De("defaultIsolationScope", () => new F());
}
class Tr {
  constructor(t, n) {
    let r;
    t ? (r = t) : (r = new F());
    let o;
    (n ? (o = n) : (o = new F()),
      (this._stack = [{ scope: r }]),
      (this._isolationScope = o));
  }
  withScope(t) {
    const n = this._pushScope();
    let r;
    try {
      r = t(n);
    } catch (o) {
      throw (this._popScope(), o);
    }
    return ur(r)
      ? r.then(
          (o) => (this._popScope(), o),
          (o) => {
            throw (this._popScope(), o);
          },
        )
      : (this._popScope(), r);
  }
  getClient() {
    return this.getStackTop().client;
  }
  getScope() {
    return this.getStackTop().scope;
  }
  getIsolationScope() {
    return this._isolationScope;
  }
  getStackTop() {
    return this._stack[this._stack.length - 1];
  }
  _pushScope() {
    const t = this.getScope().clone();
    return (this._stack.push({ client: this.getClient(), scope: t }), t);
  }
  _popScope() {
    return this._stack.length <= 1 ? !1 : !!this._stack.pop();
  }
}
function Q() {
  const e = Te(),
    t = He(e);
  return (t.stack = t.stack || new Tr(Er(), $r()));
}
function Dr(e) {
  return Q().withScope(e);
}
function Pr(e, t) {
  const n = Q();
  return n.withScope(() => ((n.getStackTop().scope = e), t(e)));
}
function yt(e) {
  return Q().withScope(() => e(Q().getIsolationScope()));
}
function Mr() {
  return {
    withIsolationScope: yt,
    withScope: Dr,
    withSetScope: Pr,
    withSetIsolationScope: (e, t) => yt(t),
    getCurrentScope: () => Q().getScope(),
    getIsolationScope: () => Q().getIsolationScope(),
  };
}
function Qe(e) {
  const t = He(e);
  return t.acs ? t.acs : Mr();
}
function Ir() {
  const e = Te();
  return Qe(e).getCurrentScope();
}
function ff() {
  const e = Te();
  return Qe(e).getIsolationScope();
}
function lf() {
  return De("globalScope", () => new F());
}
function df(...e) {
  const t = Te(),
    n = Qe(t);
  if (e.length === 2) {
    const [r, o] = e;
    return r ? n.withSetScope(r, o) : n.withScope(o);
  }
  return n.withScope(e[0]);
}
function hf() {
  return Ir().getClient();
}
function pf(e) {
  const t = e.getPropagationContext(),
    { traceId: n, parentSpanId: r, propagationSpanId: o } = t,
    i = { trace_id: n, span_id: o || Or() };
  return (r && (i.parent_span_id = r), i);
}
const bt = [];
function Zr(e) {
  const t = {};
  return (
    e.forEach((n) => {
      const { name: r } = n,
        o = t[r];
      (o && !o.isDefaultInstance && n.isDefaultInstance) || (t[r] = n);
    }),
    Object.values(t)
  );
}
function mf(e) {
  const t = e.defaultIntegrations || [],
    n = e.integrations;
  t.forEach((o) => {
    o.isDefaultInstance = !0;
  });
  let r;
  if (Array.isArray(n)) r = [...t, ...n];
  else if (typeof n == "function") {
    const o = n(t);
    r = Array.isArray(o) ? o : [o];
  } else r = t;
  return Zr(r);
}
function gf(e, t) {
  const n = {};
  return (
    t.forEach((r) => {
      r && Nr(e, r, n);
    }),
    n
  );
}
function _f(e, t) {
  for (const n of t) n?.afterAllSetup && n.afterAllSetup(e);
}
function Nr(e, t, n) {
  if (n[t.name]) {
    x &&
      Y.log(`Integration skipped because it was already installed: ${t.name}`);
    return;
  }
  if (
    ((n[t.name] = t),
    !bt.includes(t.name) &&
      typeof t.setupOnce == "function" &&
      (t.setupOnce(), bt.push(t.name)),
    t.setup && typeof t.setup == "function" && t.setup(e),
    typeof t.preprocessEvent == "function")
  ) {
    const r = t.preprocessEvent.bind(t);
    e.on("preprocessEvent", (o, i) => r(o, i, e));
  }
  if (typeof t.processEvent == "function") {
    const r = t.processEvent.bind(t),
      o = Object.assign((i, s) => r(i, s, e), { id: t.name });
    e.addEventProcessor(o);
  }
  x && Y.log(`Integration installed: ${t.name}`);
}
function yf(e) {
  return e;
}
const an = 6048e5,
  Cr = 864e5,
  xr = 6e4,
  Ar = 36e5,
  ge = 43200,
  wt = 1440,
  vt = Symbol.for("constructDateFrom");
function k(e, t) {
  return typeof e == "function"
    ? e(t)
    : e && typeof e == "object" && vt in e
      ? e[vt](t)
      : e instanceof Date
        ? new e.constructor(t)
        : new Date(t);
}
function g(e, t) {
  return k(t || e, e);
}
function Fr(e, t, n) {
  const r = g(e, n?.in);
  return isNaN(t) ? k(e, NaN) : (t && r.setDate(r.getDate() + t), r);
}
function cn(e, t, n) {
  const r = g(e, n?.in);
  if (isNaN(t)) return k(e, NaN);
  if (!t) return r;
  const o = r.getDate(),
    i = k(e, r.getTime());
  i.setMonth(r.getMonth() + t + 1, 0);
  const s = i.getDate();
  return o >= s ? i : (r.setFullYear(i.getFullYear(), i.getMonth(), o), r);
}
let jr = {};
function te() {
  return jr;
}
function fe(e, t) {
  const n = te(),
    r =
      t?.weekStartsOn ??
      t?.locale?.options?.weekStartsOn ??
      n.weekStartsOn ??
      n.locale?.options?.weekStartsOn ??
      0,
    o = g(e, t?.in),
    i = o.getDay(),
    s = (i < r ? 7 : 0) + i - r;
  return (o.setDate(o.getDate() - s), o.setHours(0, 0, 0, 0), o);
}
function ve(e, t) {
  return fe(e, { ...t, weekStartsOn: 1 });
}
function un(e, t) {
  const n = g(e, t?.in),
    r = n.getFullYear(),
    o = k(n, 0);
  (o.setFullYear(r + 1, 0, 4), o.setHours(0, 0, 0, 0));
  const i = ve(o),
    s = k(n, 0);
  (s.setFullYear(r, 0, 4), s.setHours(0, 0, 0, 0));
  const a = ve(s);
  return n.getTime() >= i.getTime()
    ? r + 1
    : n.getTime() >= a.getTime()
      ? r
      : r - 1;
}
function Se(e) {
  const t = g(e),
    n = new Date(
      Date.UTC(
        t.getFullYear(),
        t.getMonth(),
        t.getDate(),
        t.getHours(),
        t.getMinutes(),
        t.getSeconds(),
        t.getMilliseconds(),
      ),
    );
  return (n.setUTCFullYear(t.getFullYear()), +e - +n);
}
function C(e, ...t) {
  const n = k.bind(null, e || t.find((r) => typeof r == "object"));
  return t.map(n);
}
function ke(e, t) {
  const n = g(e, t?.in);
  return (n.setHours(0, 0, 0, 0), n);
}
function fn(e, t, n) {
  const [r, o] = C(n?.in, e, t),
    i = ke(r),
    s = ke(o),
    a = +i - Se(i),
    c = +s - Se(s);
  return Math.round((a - c) / Cr);
}
function Rr(e, t) {
  const n = un(e, t),
    r = k(e, 0);
  return (r.setFullYear(n, 0, 4), r.setHours(0, 0, 0, 0), ve(r));
}
function bf(e, t, n) {
  return Fr(e, t * 7, n);
}
function wf(e, t, n) {
  return cn(e, t * 12, n);
}
function vf(e, t) {
  let n,
    r = t?.in;
  return (
    e.forEach((o) => {
      !r && typeof o == "object" && (r = k.bind(null, o));
      const i = g(o, r);
      (!n || n < i || isNaN(+i)) && (n = i);
    }),
    k(r, n || NaN)
  );
}
function Sf(e, t) {
  let n,
    r = t?.in;
  return (
    e.forEach((o) => {
      !r && typeof o == "object" && (r = k.bind(null, o));
      const i = g(o, r);
      (!n || n > i || isNaN(+i)) && (n = i);
    }),
    k(r, n || NaN)
  );
}
function we(e, t) {
  const n = +g(e) - +g(t);
  return n < 0 ? -1 : n > 0 ? 1 : n;
}
function Lr(e) {
  return k(e, Date.now());
}
function kf(e, t, n) {
  const [r, o] = C(n?.in, e, t);
  return +ke(r) == +ke(o);
}
function Ur(e) {
  return (
    e instanceof Date ||
    (typeof e == "object" &&
      Object.prototype.toString.call(e) === "[object Date]")
  );
}
function Yr(e) {
  return !((!Ur(e) && typeof e != "number") || isNaN(+g(e)));
}
function Wr(e, t, n) {
  const [r, o] = C(n?.in, e, t),
    i = r.getFullYear() - o.getFullYear(),
    s = r.getMonth() - o.getMonth();
  return i * 12 + s;
}
function Of(e, t, n) {
  const [r, o] = C(n?.in, e, t),
    i = St(r, o),
    s = Math.abs(fn(r, o));
  r.setDate(r.getDate() - i * s);
  const a = +(St(r, o) === -i),
    c = i * (s - a);
  return c === 0 ? 0 : c;
}
function St(e, t) {
  const n =
    e.getFullYear() - t.getFullYear() ||
    e.getMonth() - t.getMonth() ||
    e.getDate() - t.getDate() ||
    e.getHours() - t.getHours() ||
    e.getMinutes() - t.getMinutes() ||
    e.getSeconds() - t.getSeconds() ||
    e.getMilliseconds() - t.getMilliseconds();
  return n < 0 ? -1 : n > 0 ? 1 : n;
}
function et(e) {
  return (t) => {
    const n = Math.trunc,
      r = n(t);
    return r === 0 ? 0 : r;
  };
}
function zf(e, t, n) {
  const [r, o] = C(n?.in, e, t),
    i = (+r - +o) / Ar;
  return et()(i);
}
function ln(e, t) {
  return +g(e) - +g(t);
}
function Ef(e, t, n) {
  const r = ln(e, t) / xr;
  return et()(r);
}
function Jr(e, t) {
  const n = g(e, t?.in);
  return (n.setHours(23, 59, 59, 999), n);
}
function Vr(e, t) {
  const n = g(e, t?.in),
    r = n.getMonth();
  return (
    n.setFullYear(n.getFullYear(), r + 1, 0),
    n.setHours(23, 59, 59, 999),
    n
  );
}
function Hr(e, t) {
  const n = g(e, t?.in);
  return +Jr(n, t) == +Vr(n, t);
}
function Br(e, t, n) {
  const [r, o, i] = C(n?.in, e, e, t),
    s = we(o, i),
    a = Math.abs(Wr(o, i));
  if (a < 1) return 0;
  (o.getMonth() === 1 && o.getDate() > 27 && o.setDate(30),
    o.setMonth(o.getMonth() - s * a));
  let c = we(o, i) === -s;
  Hr(r) && a === 1 && we(r, i) === 1 && (c = !1);
  const u = s * (a - +c);
  return u === 0 ? 0 : u;
}
function Gr(e, t, n) {
  const r = ln(e, t) / 1e3;
  return et()(r);
}
function tt(e, t) {
  const [n, r] = C(e, t.start, t.end);
  return { start: n, end: r };
}
function $f(e, t) {
  const { start: n, end: r } = tt(t?.in, e);
  let o = +n > +r;
  const i = o ? +n : +r,
    s = o ? r : n;
  s.setHours(0, 0, 0, 0);
  let a = 1;
  const c = [];
  for (; +s <= i; )
    (c.push(k(n, s)), s.setDate(s.getDate() + a), s.setHours(0, 0, 0, 0));
  return o ? c.reverse() : c;
}
function Tf(e, t) {
  const { start: n, end: r } = tt(t?.in, e);
  let o = +n > +r;
  const i = o ? +n : +r,
    s = o ? r : n;
  (s.setHours(0, 0, 0, 0), s.setDate(1));
  let a = 1;
  const c = [];
  for (; +s <= i; ) (c.push(k(n, s)), s.setMonth(s.getMonth() + a));
  return o ? c.reverse() : c;
}
function Df(e, t) {
  const n = g(e, t?.in),
    r = n.getMonth(),
    o = r - (r % 3);
  return (n.setMonth(o, 1), n.setHours(0, 0, 0, 0), n);
}
function Pf(e, t) {
  const n = g(e, t?.in);
  return (n.setDate(1), n.setHours(0, 0, 0, 0), n);
}
function Mf(e, t) {
  const n = g(e, t?.in),
    r = n.getFullYear();
  return (n.setFullYear(r + 1, 0, 0), n.setHours(23, 59, 59, 999), n);
}
function Xr(e, t) {
  const n = g(e, t?.in);
  return (n.setFullYear(n.getFullYear(), 0, 1), n.setHours(0, 0, 0, 0), n);
}
function If(e, t) {
  const { start: n, end: r } = tt(t?.in, e);
  let o = +n > +r;
  const i = o ? +n : +r,
    s = o ? r : n;
  (s.setHours(0, 0, 0, 0), s.setMonth(0, 1));
  let a = 1;
  const c = [];
  for (; +s <= i; ) (c.push(k(n, s)), s.setFullYear(s.getFullYear() + a));
  return o ? c.reverse() : c;
}
function qr(e, t) {
  const n = te(),
    r =
      t?.weekStartsOn ??
      t?.locale?.options?.weekStartsOn ??
      n.weekStartsOn ??
      n.locale?.options?.weekStartsOn ??
      0,
    o = g(e, t?.in),
    i = o.getDay(),
    s = (i < r ? -7 : 0) + 6 - (i - r);
  return (o.setDate(o.getDate() + s), o.setHours(23, 59, 59, 999), o);
}
function Zf(e, t) {
  return qr(e, { ...t, weekStartsOn: 1 });
}
function Nf(e, t) {
  const n = g(e, t?.in),
    r = n.getMonth(),
    o = r - (r % 3) + 3;
  return (n.setMonth(o, 0), n.setHours(23, 59, 59, 999), n);
}
const Kr = {
    lessThanXSeconds: {
      one: "less than a second",
      other: "less than {{count}} seconds",
    },
    xSeconds: { one: "1 second", other: "{{count}} seconds" },
    halfAMinute: "half a minute",
    lessThanXMinutes: {
      one: "less than a minute",
      other: "less than {{count}} minutes",
    },
    xMinutes: { one: "1 minute", other: "{{count}} minutes" },
    aboutXHours: { one: "about 1 hour", other: "about {{count}} hours" },
    xHours: { one: "1 hour", other: "{{count}} hours" },
    xDays: { one: "1 day", other: "{{count}} days" },
    aboutXWeeks: { one: "about 1 week", other: "about {{count}} weeks" },
    xWeeks: { one: "1 week", other: "{{count}} weeks" },
    aboutXMonths: { one: "about 1 month", other: "about {{count}} months" },
    xMonths: { one: "1 month", other: "{{count}} months" },
    aboutXYears: { one: "about 1 year", other: "about {{count}} years" },
    xYears: { one: "1 year", other: "{{count}} years" },
    overXYears: { one: "over 1 year", other: "over {{count}} years" },
    almostXYears: { one: "almost 1 year", other: "almost {{count}} years" },
  },
  Qr = (e, t, n) => {
    let r;
    const o = Kr[e];
    return (
      typeof o == "string"
        ? (r = o)
        : t === 1
          ? (r = o.one)
          : (r = o.other.replace("{{count}}", t.toString())),
      n?.addSuffix
        ? n.comparison && n.comparison > 0
          ? "in " + r
          : r + " ago"
        : r
    );
  };
function Ae(e) {
  return (t = {}) => {
    const n = t.width ? String(t.width) : e.defaultWidth;
    return e.formats[n] || e.formats[e.defaultWidth];
  };
}
const eo = {
    full: "EEEE, MMMM do, y",
    long: "MMMM do, y",
    medium: "MMM d, y",
    short: "MM/dd/yyyy",
  },
  to = {
    full: "h:mm:ss a zzzz",
    long: "h:mm:ss a z",
    medium: "h:mm:ss a",
    short: "h:mm a",
  },
  no = {
    full: "{{date}} 'at' {{time}}",
    long: "{{date}} 'at' {{time}}",
    medium: "{{date}}, {{time}}",
    short: "{{date}}, {{time}}",
  },
  ro = {
    date: Ae({ formats: eo, defaultWidth: "full" }),
    time: Ae({ formats: to, defaultWidth: "full" }),
    dateTime: Ae({ formats: no, defaultWidth: "full" }),
  },
  oo = {
    lastWeek: "'last' eeee 'at' p",
    yesterday: "'yesterday at' p",
    today: "'today at' p",
    tomorrow: "'tomorrow at' p",
    nextWeek: "eeee 'at' p",
    other: "P",
  },
  so = (e, t, n, r) => oo[e];
function oe(e) {
  return (t, n) => {
    const r = n?.context ? String(n.context) : "standalone";
    let o;
    if (r === "formatting" && e.formattingValues) {
      const s = e.defaultFormattingWidth || e.defaultWidth,
        a = n?.width ? String(n.width) : s;
      o = e.formattingValues[a] || e.formattingValues[s];
    } else {
      const s = e.defaultWidth,
        a = n?.width ? String(n.width) : e.defaultWidth;
      o = e.values[a] || e.values[s];
    }
    const i = e.argumentCallback ? e.argumentCallback(t) : t;
    return o[i];
  };
}
const io = {
    narrow: ["B", "A"],
    abbreviated: ["BC", "AD"],
    wide: ["Before Christ", "Anno Domini"],
  },
  ao = {
    narrow: ["1", "2", "3", "4"],
    abbreviated: ["Q1", "Q2", "Q3", "Q4"],
    wide: ["1st quarter", "2nd quarter", "3rd quarter", "4th quarter"],
  },
  co = {
    narrow: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
    abbreviated: [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ],
    wide: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
  },
  uo = {
    narrow: ["S", "M", "T", "W", "T", "F", "S"],
    short: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    abbreviated: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    wide: [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ],
  },
  fo = {
    narrow: {
      am: "a",
      pm: "p",
      midnight: "mi",
      noon: "n",
      morning: "morning",
      afternoon: "afternoon",
      evening: "evening",
      night: "night",
    },
    abbreviated: {
      am: "AM",
      pm: "PM",
      midnight: "midnight",
      noon: "noon",
      morning: "morning",
      afternoon: "afternoon",
      evening: "evening",
      night: "night",
    },
    wide: {
      am: "a.m.",
      pm: "p.m.",
      midnight: "midnight",
      noon: "noon",
      morning: "morning",
      afternoon: "afternoon",
      evening: "evening",
      night: "night",
    },
  },
  lo = {
    narrow: {
      am: "a",
      pm: "p",
      midnight: "mi",
      noon: "n",
      morning: "in the morning",
      afternoon: "in the afternoon",
      evening: "in the evening",
      night: "at night",
    },
    abbreviated: {
      am: "AM",
      pm: "PM",
      midnight: "midnight",
      noon: "noon",
      morning: "in the morning",
      afternoon: "in the afternoon",
      evening: "in the evening",
      night: "at night",
    },
    wide: {
      am: "a.m.",
      pm: "p.m.",
      midnight: "midnight",
      noon: "noon",
      morning: "in the morning",
      afternoon: "in the afternoon",
      evening: "in the evening",
      night: "at night",
    },
  },
  ho = (e, t) => {
    const n = Number(e),
      r = n % 100;
    if (r > 20 || r < 10)
      switch (r % 10) {
        case 1:
          return n + "st";
        case 2:
          return n + "nd";
        case 3:
          return n + "rd";
      }
    return n + "th";
  },
  po = {
    ordinalNumber: ho,
    era: oe({ values: io, defaultWidth: "wide" }),
    quarter: oe({
      values: ao,
      defaultWidth: "wide",
      argumentCallback: (e) => e - 1,
    }),
    month: oe({ values: co, defaultWidth: "wide" }),
    day: oe({ values: uo, defaultWidth: "wide" }),
    dayPeriod: oe({
      values: fo,
      defaultWidth: "wide",
      formattingValues: lo,
      defaultFormattingWidth: "wide",
    }),
  };
function se(e) {
  return (t, n = {}) => {
    const r = n.width,
      o = (r && e.matchPatterns[r]) || e.matchPatterns[e.defaultMatchWidth],
      i = t.match(o);
    if (!i) return null;
    const s = i[0],
      a = (r && e.parsePatterns[r]) || e.parsePatterns[e.defaultParseWidth],
      c = Array.isArray(a) ? go(a, (d) => d.test(s)) : mo(a, (d) => d.test(s));
    let u;
    ((u = e.valueCallback ? e.valueCallback(c) : c),
      (u = n.valueCallback ? n.valueCallback(u) : u));
    const l = t.slice(s.length);
    return { value: u, rest: l };
  };
}
function mo(e, t) {
  for (const n in e)
    if (Object.prototype.hasOwnProperty.call(e, n) && t(e[n])) return n;
}
function go(e, t) {
  for (let n = 0; n < e.length; n++) if (t(e[n])) return n;
}
function _o(e) {
  return (t, n = {}) => {
    const r = t.match(e.matchPattern);
    if (!r) return null;
    const o = r[0],
      i = t.match(e.parsePattern);
    if (!i) return null;
    let s = e.valueCallback ? e.valueCallback(i[0]) : i[0];
    s = n.valueCallback ? n.valueCallback(s) : s;
    const a = t.slice(o.length);
    return { value: s, rest: a };
  };
}
const yo = /^(\d+)(th|st|nd|rd)?/i,
  bo = /\d+/i,
  wo = {
    narrow: /^(b|a)/i,
    abbreviated: /^(b\.?\s?c\.?|b\.?\s?c\.?\s?e\.?|a\.?\s?d\.?|c\.?\s?e\.?)/i,
    wide: /^(before christ|before common era|anno domini|common era)/i,
  },
  vo = { any: [/^b/i, /^(a|c)/i] },
  So = {
    narrow: /^[1234]/i,
    abbreviated: /^q[1234]/i,
    wide: /^[1234](th|st|nd|rd)? quarter/i,
  },
  ko = { any: [/1/i, /2/i, /3/i, /4/i] },
  Oo = {
    narrow: /^[jfmasond]/i,
    abbreviated: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
    wide: /^(january|february|march|april|may|june|july|august|september|october|november|december)/i,
  },
  zo = {
    narrow: [
      /^j/i,
      /^f/i,
      /^m/i,
      /^a/i,
      /^m/i,
      /^j/i,
      /^j/i,
      /^a/i,
      /^s/i,
      /^o/i,
      /^n/i,
      /^d/i,
    ],
    any: [
      /^ja/i,
      /^f/i,
      /^mar/i,
      /^ap/i,
      /^may/i,
      /^jun/i,
      /^jul/i,
      /^au/i,
      /^s/i,
      /^o/i,
      /^n/i,
      /^d/i,
    ],
  },
  Eo = {
    narrow: /^[smtwf]/i,
    short: /^(su|mo|tu|we|th|fr|sa)/i,
    abbreviated: /^(sun|mon|tue|wed|thu|fri|sat)/i,
    wide: /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i,
  },
  $o = {
    narrow: [/^s/i, /^m/i, /^t/i, /^w/i, /^t/i, /^f/i, /^s/i],
    any: [/^su/i, /^m/i, /^tu/i, /^w/i, /^th/i, /^f/i, /^sa/i],
  },
  To = {
    narrow: /^(a|p|mi|n|(in the|at) (morning|afternoon|evening|night))/i,
    any: /^([ap]\.?\s?m\.?|midnight|noon|(in the|at) (morning|afternoon|evening|night))/i,
  },
  Do = {
    any: {
      am: /^a/i,
      pm: /^p/i,
      midnight: /^mi/i,
      noon: /^no/i,
      morning: /morning/i,
      afternoon: /afternoon/i,
      evening: /evening/i,
      night: /night/i,
    },
  },
  Po = {
    ordinalNumber: _o({
      matchPattern: yo,
      parsePattern: bo,
      valueCallback: (e) => parseInt(e, 10),
    }),
    era: se({
      matchPatterns: wo,
      defaultMatchWidth: "wide",
      parsePatterns: vo,
      defaultParseWidth: "any",
    }),
    quarter: se({
      matchPatterns: So,
      defaultMatchWidth: "wide",
      parsePatterns: ko,
      defaultParseWidth: "any",
      valueCallback: (e) => e + 1,
    }),
    month: se({
      matchPatterns: Oo,
      defaultMatchWidth: "wide",
      parsePatterns: zo,
      defaultParseWidth: "any",
    }),
    day: se({
      matchPatterns: Eo,
      defaultMatchWidth: "wide",
      parsePatterns: $o,
      defaultParseWidth: "any",
    }),
    dayPeriod: se({
      matchPatterns: To,
      defaultMatchWidth: "any",
      parsePatterns: Do,
      defaultParseWidth: "any",
    }),
  },
  dn = {
    code: "en-US",
    formatDistance: Qr,
    formatLong: ro,
    formatRelative: so,
    localize: po,
    match: Po,
    options: { weekStartsOn: 0, firstWeekContainsDate: 1 },
  };
function Mo(e, t) {
  const n = g(e, t?.in);
  return fn(n, Xr(n)) + 1;
}
function Io(e, t) {
  const n = g(e, t?.in),
    r = +ve(n) - +Rr(n);
  return Math.round(r / an) + 1;
}
function hn(e, t) {
  const n = g(e, t?.in),
    r = n.getFullYear(),
    o = te(),
    i =
      t?.firstWeekContainsDate ??
      t?.locale?.options?.firstWeekContainsDate ??
      o.firstWeekContainsDate ??
      o.locale?.options?.firstWeekContainsDate ??
      1,
    s = k(t?.in || e, 0);
  (s.setFullYear(r + 1, 0, i), s.setHours(0, 0, 0, 0));
  const a = fe(s, t),
    c = k(t?.in || e, 0);
  (c.setFullYear(r, 0, i), c.setHours(0, 0, 0, 0));
  const u = fe(c, t);
  return +n >= +a ? r + 1 : +n >= +u ? r : r - 1;
}
function Zo(e, t) {
  const n = te(),
    r =
      t?.firstWeekContainsDate ??
      t?.locale?.options?.firstWeekContainsDate ??
      n.firstWeekContainsDate ??
      n.locale?.options?.firstWeekContainsDate ??
      1,
    o = hn(e, t),
    i = k(t?.in || e, 0);
  return (i.setFullYear(o, 0, r), i.setHours(0, 0, 0, 0), fe(i, t));
}
function No(e, t) {
  const n = g(e, t?.in),
    r = +fe(n, t) - +Zo(n, t);
  return Math.round(r / an) + 1;
}
function _(e, t) {
  const n = e < 0 ? "-" : "",
    r = Math.abs(e).toString().padStart(t, "0");
  return n + r;
}
const A = {
    y(e, t) {
      const n = e.getFullYear(),
        r = n > 0 ? n : 1 - n;
      return _(t === "yy" ? r % 100 : r, t.length);
    },
    M(e, t) {
      const n = e.getMonth();
      return t === "M" ? String(n + 1) : _(n + 1, 2);
    },
    d(e, t) {
      return _(e.getDate(), t.length);
    },
    a(e, t) {
      const n = e.getHours() / 12 >= 1 ? "pm" : "am";
      switch (t) {
        case "a":
        case "aa":
          return n.toUpperCase();
        case "aaa":
          return n;
        case "aaaaa":
          return n[0];
        default:
          return n === "am" ? "a.m." : "p.m.";
      }
    },
    h(e, t) {
      return _(e.getHours() % 12 || 12, t.length);
    },
    H(e, t) {
      return _(e.getHours(), t.length);
    },
    m(e, t) {
      return _(e.getMinutes(), t.length);
    },
    s(e, t) {
      return _(e.getSeconds(), t.length);
    },
    S(e, t) {
      const n = t.length,
        r = e.getMilliseconds(),
        o = Math.trunc(r * Math.pow(10, n - 3));
      return _(o, t.length);
    },
  },
  X = {
    midnight: "midnight",
    noon: "noon",
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night",
  },
  kt = {
    G: function (e, t, n) {
      const r = e.getFullYear() > 0 ? 1 : 0;
      switch (t) {
        case "G":
        case "GG":
        case "GGG":
          return n.era(r, { width: "abbreviated" });
        case "GGGGG":
          return n.era(r, { width: "narrow" });
        default:
          return n.era(r, { width: "wide" });
      }
    },
    y: function (e, t, n) {
      if (t === "yo") {
        const r = e.getFullYear(),
          o = r > 0 ? r : 1 - r;
        return n.ordinalNumber(o, { unit: "year" });
      }
      return A.y(e, t);
    },
    Y: function (e, t, n, r) {
      const o = hn(e, r),
        i = o > 0 ? o : 1 - o;
      if (t === "YY") {
        const s = i % 100;
        return _(s, 2);
      }
      return t === "Yo" ? n.ordinalNumber(i, { unit: "year" }) : _(i, t.length);
    },
    R: function (e, t) {
      const n = un(e);
      return _(n, t.length);
    },
    u: function (e, t) {
      const n = e.getFullYear();
      return _(n, t.length);
    },
    Q: function (e, t, n) {
      const r = Math.ceil((e.getMonth() + 1) / 3);
      switch (t) {
        case "Q":
          return String(r);
        case "QQ":
          return _(r, 2);
        case "Qo":
          return n.ordinalNumber(r, { unit: "quarter" });
        case "QQQ":
          return n.quarter(r, { width: "abbreviated", context: "formatting" });
        case "QQQQQ":
          return n.quarter(r, { width: "narrow", context: "formatting" });
        default:
          return n.quarter(r, { width: "wide", context: "formatting" });
      }
    },
    q: function (e, t, n) {
      const r = Math.ceil((e.getMonth() + 1) / 3);
      switch (t) {
        case "q":
          return String(r);
        case "qq":
          return _(r, 2);
        case "qo":
          return n.ordinalNumber(r, { unit: "quarter" });
        case "qqq":
          return n.quarter(r, { width: "abbreviated", context: "standalone" });
        case "qqqqq":
          return n.quarter(r, { width: "narrow", context: "standalone" });
        default:
          return n.quarter(r, { width: "wide", context: "standalone" });
      }
    },
    M: function (e, t, n) {
      const r = e.getMonth();
      switch (t) {
        case "M":
        case "MM":
          return A.M(e, t);
        case "Mo":
          return n.ordinalNumber(r + 1, { unit: "month" });
        case "MMM":
          return n.month(r, { width: "abbreviated", context: "formatting" });
        case "MMMMM":
          return n.month(r, { width: "narrow", context: "formatting" });
        default:
          return n.month(r, { width: "wide", context: "formatting" });
      }
    },
    L: function (e, t, n) {
      const r = e.getMonth();
      switch (t) {
        case "L":
          return String(r + 1);
        case "LL":
          return _(r + 1, 2);
        case "Lo":
          return n.ordinalNumber(r + 1, { unit: "month" });
        case "LLL":
          return n.month(r, { width: "abbreviated", context: "standalone" });
        case "LLLLL":
          return n.month(r, { width: "narrow", context: "standalone" });
        default:
          return n.month(r, { width: "wide", context: "standalone" });
      }
    },
    w: function (e, t, n, r) {
      const o = No(e, r);
      return t === "wo" ? n.ordinalNumber(o, { unit: "week" }) : _(o, t.length);
    },
    I: function (e, t, n) {
      const r = Io(e);
      return t === "Io" ? n.ordinalNumber(r, { unit: "week" }) : _(r, t.length);
    },
    d: function (e, t, n) {
      return t === "do"
        ? n.ordinalNumber(e.getDate(), { unit: "date" })
        : A.d(e, t);
    },
    D: function (e, t, n) {
      const r = Mo(e);
      return t === "Do"
        ? n.ordinalNumber(r, { unit: "dayOfYear" })
        : _(r, t.length);
    },
    E: function (e, t, n) {
      const r = e.getDay();
      switch (t) {
        case "E":
        case "EE":
        case "EEE":
          return n.day(r, { width: "abbreviated", context: "formatting" });
        case "EEEEE":
          return n.day(r, { width: "narrow", context: "formatting" });
        case "EEEEEE":
          return n.day(r, { width: "short", context: "formatting" });
        default:
          return n.day(r, { width: "wide", context: "formatting" });
      }
    },
    e: function (e, t, n, r) {
      const o = e.getDay(),
        i = (o - r.weekStartsOn + 8) % 7 || 7;
      switch (t) {
        case "e":
          return String(i);
        case "ee":
          return _(i, 2);
        case "eo":
          return n.ordinalNumber(i, { unit: "day" });
        case "eee":
          return n.day(o, { width: "abbreviated", context: "formatting" });
        case "eeeee":
          return n.day(o, { width: "narrow", context: "formatting" });
        case "eeeeee":
          return n.day(o, { width: "short", context: "formatting" });
        default:
          return n.day(o, { width: "wide", context: "formatting" });
      }
    },
    c: function (e, t, n, r) {
      const o = e.getDay(),
        i = (o - r.weekStartsOn + 8) % 7 || 7;
      switch (t) {
        case "c":
          return String(i);
        case "cc":
          return _(i, t.length);
        case "co":
          return n.ordinalNumber(i, { unit: "day" });
        case "ccc":
          return n.day(o, { width: "abbreviated", context: "standalone" });
        case "ccccc":
          return n.day(o, { width: "narrow", context: "standalone" });
        case "cccccc":
          return n.day(o, { width: "short", context: "standalone" });
        default:
          return n.day(o, { width: "wide", context: "standalone" });
      }
    },
    i: function (e, t, n) {
      const r = e.getDay(),
        o = r === 0 ? 7 : r;
      switch (t) {
        case "i":
          return String(o);
        case "ii":
          return _(o, t.length);
        case "io":
          return n.ordinalNumber(o, { unit: "day" });
        case "iii":
          return n.day(r, { width: "abbreviated", context: "formatting" });
        case "iiiii":
          return n.day(r, { width: "narrow", context: "formatting" });
        case "iiiiii":
          return n.day(r, { width: "short", context: "formatting" });
        default:
          return n.day(r, { width: "wide", context: "formatting" });
      }
    },
    a: function (e, t, n) {
      const o = e.getHours() / 12 >= 1 ? "pm" : "am";
      switch (t) {
        case "a":
        case "aa":
          return n.dayPeriod(o, {
            width: "abbreviated",
            context: "formatting",
          });
        case "aaa":
          return n
            .dayPeriod(o, { width: "abbreviated", context: "formatting" })
            .toLowerCase();
        case "aaaaa":
          return n.dayPeriod(o, { width: "narrow", context: "formatting" });
        default:
          return n.dayPeriod(o, { width: "wide", context: "formatting" });
      }
    },
    b: function (e, t, n) {
      const r = e.getHours();
      let o;
      switch (
        (r === 12
          ? (o = X.noon)
          : r === 0
            ? (o = X.midnight)
            : (o = r / 12 >= 1 ? "pm" : "am"),
        t)
      ) {
        case "b":
        case "bb":
          return n.dayPeriod(o, {
            width: "abbreviated",
            context: "formatting",
          });
        case "bbb":
          return n
            .dayPeriod(o, { width: "abbreviated", context: "formatting" })
            .toLowerCase();
        case "bbbbb":
          return n.dayPeriod(o, { width: "narrow", context: "formatting" });
        default:
          return n.dayPeriod(o, { width: "wide", context: "formatting" });
      }
    },
    B: function (e, t, n) {
      const r = e.getHours();
      let o;
      switch (
        (r >= 17
          ? (o = X.evening)
          : r >= 12
            ? (o = X.afternoon)
            : r >= 4
              ? (o = X.morning)
              : (o = X.night),
        t)
      ) {
        case "B":
        case "BB":
        case "BBB":
          return n.dayPeriod(o, {
            width: "abbreviated",
            context: "formatting",
          });
        case "BBBBB":
          return n.dayPeriod(o, { width: "narrow", context: "formatting" });
        default:
          return n.dayPeriod(o, { width: "wide", context: "formatting" });
      }
    },
    h: function (e, t, n) {
      if (t === "ho") {
        let r = e.getHours() % 12;
        return (r === 0 && (r = 12), n.ordinalNumber(r, { unit: "hour" }));
      }
      return A.h(e, t);
    },
    H: function (e, t, n) {
      return t === "Ho"
        ? n.ordinalNumber(e.getHours(), { unit: "hour" })
        : A.H(e, t);
    },
    K: function (e, t, n) {
      const r = e.getHours() % 12;
      return t === "Ko" ? n.ordinalNumber(r, { unit: "hour" }) : _(r, t.length);
    },
    k: function (e, t, n) {
      let r = e.getHours();
      return (
        r === 0 && (r = 24),
        t === "ko" ? n.ordinalNumber(r, { unit: "hour" }) : _(r, t.length)
      );
    },
    m: function (e, t, n) {
      return t === "mo"
        ? n.ordinalNumber(e.getMinutes(), { unit: "minute" })
        : A.m(e, t);
    },
    s: function (e, t, n) {
      return t === "so"
        ? n.ordinalNumber(e.getSeconds(), { unit: "second" })
        : A.s(e, t);
    },
    S: function (e, t) {
      return A.S(e, t);
    },
    X: function (e, t, n) {
      const r = e.getTimezoneOffset();
      if (r === 0) return "Z";
      switch (t) {
        case "X":
          return zt(r);
        case "XXXX":
        case "XX":
          return L(r);
        default:
          return L(r, ":");
      }
    },
    x: function (e, t, n) {
      const r = e.getTimezoneOffset();
      switch (t) {
        case "x":
          return zt(r);
        case "xxxx":
        case "xx":
          return L(r);
        default:
          return L(r, ":");
      }
    },
    O: function (e, t, n) {
      const r = e.getTimezoneOffset();
      switch (t) {
        case "O":
        case "OO":
        case "OOO":
          return "GMT" + Ot(r, ":");
        default:
          return "GMT" + L(r, ":");
      }
    },
    z: function (e, t, n) {
      const r = e.getTimezoneOffset();
      switch (t) {
        case "z":
        case "zz":
        case "zzz":
          return "GMT" + Ot(r, ":");
        default:
          return "GMT" + L(r, ":");
      }
    },
    t: function (e, t, n) {
      const r = Math.trunc(+e / 1e3);
      return _(r, t.length);
    },
    T: function (e, t, n) {
      return _(+e, t.length);
    },
  };
function Ot(e, t = "") {
  const n = e > 0 ? "-" : "+",
    r = Math.abs(e),
    o = Math.trunc(r / 60),
    i = r % 60;
  return i === 0 ? n + String(o) : n + String(o) + t + _(i, 2);
}
function zt(e, t) {
  return e % 60 === 0 ? (e > 0 ? "-" : "+") + _(Math.abs(e) / 60, 2) : L(e, t);
}
function L(e, t = "") {
  const n = e > 0 ? "-" : "+",
    r = Math.abs(e),
    o = _(Math.trunc(r / 60), 2),
    i = _(r % 60, 2);
  return n + o + t + i;
}
const Et = (e, t) => {
    switch (e) {
      case "P":
        return t.date({ width: "short" });
      case "PP":
        return t.date({ width: "medium" });
      case "PPP":
        return t.date({ width: "long" });
      default:
        return t.date({ width: "full" });
    }
  },
  pn = (e, t) => {
    switch (e) {
      case "p":
        return t.time({ width: "short" });
      case "pp":
        return t.time({ width: "medium" });
      case "ppp":
        return t.time({ width: "long" });
      default:
        return t.time({ width: "full" });
    }
  },
  Co = (e, t) => {
    const n = e.match(/(P+)(p+)?/) || [],
      r = n[1],
      o = n[2];
    if (!o) return Et(e, t);
    let i;
    switch (r) {
      case "P":
        i = t.dateTime({ width: "short" });
        break;
      case "PP":
        i = t.dateTime({ width: "medium" });
        break;
      case "PPP":
        i = t.dateTime({ width: "long" });
        break;
      default:
        i = t.dateTime({ width: "full" });
        break;
    }
    return i.replace("{{date}}", Et(r, t)).replace("{{time}}", pn(o, t));
  },
  xo = { p: pn, P: Co },
  Ao = /^D+$/,
  Fo = /^Y+$/,
  jo = ["D", "DD", "YY", "YYYY"];
function Ro(e) {
  return Ao.test(e);
}
function Lo(e) {
  return Fo.test(e);
}
function Uo(e, t, n) {
  const r = Yo(e, t, n);
  if ((console.warn(r), jo.includes(e))) throw new RangeError(r);
}
function Yo(e, t, n) {
  const r = e[0] === "Y" ? "years" : "days of the month";
  return `Use \`${e.toLowerCase()}\` instead of \`${e}\` (in \`${t}\`) for formatting ${r} to the input \`${n}\`; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md`;
}
const Wo = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g,
  Jo = /P+p+|P+|p+|''|'(''|[^'])+('|$)|./g,
  Vo = /^'([^]*?)'?$/,
  Ho = /''/g,
  Bo = /[a-zA-Z]/;
function Cf(e, t, n) {
  const r = te(),
    o = n?.locale ?? r.locale ?? dn,
    i =
      n?.firstWeekContainsDate ??
      n?.locale?.options?.firstWeekContainsDate ??
      r.firstWeekContainsDate ??
      r.locale?.options?.firstWeekContainsDate ??
      1,
    s =
      n?.weekStartsOn ??
      n?.locale?.options?.weekStartsOn ??
      r.weekStartsOn ??
      r.locale?.options?.weekStartsOn ??
      0,
    a = g(e, n?.in);
  if (!Yr(a)) throw new RangeError("Invalid time value");
  let c = t
    .match(Jo)
    .map((l) => {
      const d = l[0];
      if (d === "p" || d === "P") {
        const h = xo[d];
        return h(l, o.formatLong);
      }
      return l;
    })
    .join("")
    .match(Wo)
    .map((l) => {
      if (l === "''") return { isToken: !1, value: "'" };
      const d = l[0];
      if (d === "'") return { isToken: !1, value: Go(l) };
      if (kt[d]) return { isToken: !0, value: l };
      if (d.match(Bo))
        throw new RangeError(
          "Format string contains an unescaped latin alphabet character `" +
            d +
            "`",
        );
      return { isToken: !1, value: l };
    });
  o.localize.preprocessor && (c = o.localize.preprocessor(a, c));
  const u = { firstWeekContainsDate: i, weekStartsOn: s, locale: o };
  return c
    .map((l) => {
      if (!l.isToken) return l.value;
      const d = l.value;
      ((!n?.useAdditionalWeekYearTokens && Lo(d)) ||
        (!n?.useAdditionalDayOfYearTokens && Ro(d))) &&
        Uo(d, t, String(e));
      const h = kt[d[0]];
      return h(a, d, o.localize, u);
    })
    .join("");
}
function Go(e) {
  const t = e.match(Vo);
  return t ? t[1].replace(Ho, "'") : e;
}
function Xo(e, t, n) {
  const r = te(),
    o = n?.locale ?? r.locale ?? dn,
    i = 2520,
    s = we(e, t);
  if (isNaN(s)) throw new RangeError("Invalid time value");
  const a = Object.assign({}, n, { addSuffix: n?.addSuffix, comparison: s }),
    [c, u] = C(n?.in, ...(s > 0 ? [t, e] : [e, t])),
    l = Gr(u, c),
    d = (Se(u) - Se(c)) / 1e3,
    h = Math.round((l - d) / 60);
  let m;
  if (h < 2)
    return n?.includeSeconds
      ? l < 5
        ? o.formatDistance("lessThanXSeconds", 5, a)
        : l < 10
          ? o.formatDistance("lessThanXSeconds", 10, a)
          : l < 20
            ? o.formatDistance("lessThanXSeconds", 20, a)
            : l < 40
              ? o.formatDistance("halfAMinute", 0, a)
              : l < 60
                ? o.formatDistance("lessThanXMinutes", 1, a)
                : o.formatDistance("xMinutes", 1, a)
      : h === 0
        ? o.formatDistance("lessThanXMinutes", 1, a)
        : o.formatDistance("xMinutes", h, a);
  if (h < 45) return o.formatDistance("xMinutes", h, a);
  if (h < 90) return o.formatDistance("aboutXHours", 1, a);
  if (h < wt) {
    const b = Math.round(h / 60);
    return o.formatDistance("aboutXHours", b, a);
  } else {
    if (h < i) return o.formatDistance("xDays", 1, a);
    if (h < ge) {
      const b = Math.round(h / wt);
      return o.formatDistance("xDays", b, a);
    } else if (h < ge * 2)
      return ((m = Math.round(h / ge)), o.formatDistance("aboutXMonths", m, a));
  }
  if (((m = Br(u, c)), m < 12)) {
    const b = Math.round(h / ge);
    return o.formatDistance("xMonths", b, a);
  } else {
    const b = m % 12,
      v = Math.trunc(m / 12);
    return b < 3
      ? o.formatDistance("aboutXYears", v, a)
      : b < 9
        ? o.formatDistance("overXYears", v, a)
        : o.formatDistance("almostXYears", v + 1, a);
  }
}
function xf(e, t) {
  return Xo(e, Lr(e), t);
}
function qo(e, t) {
  const n = g(e, t?.in),
    r = n.getFullYear(),
    o = n.getMonth(),
    i = k(n, 0);
  return (i.setFullYear(r, o + 1, 0), i.setHours(0, 0, 0, 0), i.getDate());
}
function Af(e, t) {
  return g(e, t?.in).getMonth();
}
function Ff(e, t) {
  return g(e, t?.in).getFullYear();
}
function jf(e, t) {
  return +g(e) > +g(t);
}
function Rf(e, t) {
  return +g(e) < +g(t);
}
function Lf(e) {
  return +g(e) > Date.now();
}
function Uf(e) {
  return +g(e) < Date.now();
}
function Yf(e, t, n) {
  const [r, o] = C(n?.in, e, t);
  return r.getFullYear() === o.getFullYear() && r.getMonth() === o.getMonth();
}
function Wf(e, t, n) {
  const [r, o] = C(n?.in, e, t);
  return r.getFullYear() === o.getFullYear();
}
function Jf(e, t, n) {
  const r = g(e, n?.in),
    o = r.getFullYear(),
    i = r.getDate(),
    s = k(e, 0);
  (s.setFullYear(o, t, 15), s.setHours(0, 0, 0, 0));
  const a = qo(s);
  return (r.setMonth(t, Math.min(i, a)), r);
}
function Vf(e, t, n) {
  const r = g(e, n?.in);
  return isNaN(+r) ? k(e, NaN) : (r.setFullYear(t), r);
}
function Hf(e, t, n) {
  return cn(e, -t, n);
}
function f(e, t, n) {
  function r(a, c) {
    if (
      (a._zod ||
        Object.defineProperty(a, "_zod", {
          value: { def: c, constr: s, traits: new Set() },
          enumerable: !1,
        }),
      a._zod.traits.has(e))
    )
      return;
    (a._zod.traits.add(e), t(a, c));
    const u = s.prototype,
      l = Object.keys(u);
    for (let d = 0; d < l.length; d++) {
      const h = l[d];
      h in a || (a[h] = u[h].bind(a));
    }
  }
  const o = n?.Parent ?? Object;
  class i extends o {}
  Object.defineProperty(i, "name", { value: e });
  function s(a) {
    var c;
    const u = n?.Parent ? new i() : this;
    (r(u, a), (c = u._zod).deferred ?? (c.deferred = []));
    for (const l of u._zod.deferred) l();
    return u;
  }
  return (
    Object.defineProperty(s, "init", { value: r }),
    Object.defineProperty(s, Symbol.hasInstance, {
      value: (a) =>
        n?.Parent && a instanceof n.Parent ? !0 : a?._zod?.traits?.has(e),
    }),
    Object.defineProperty(s, "name", { value: e }),
    s
  );
}
class K extends Error {
  constructor() {
    super(
      "Encountered Promise during synchronous parse. Use .parseAsync() instead.",
    );
  }
}
class mn extends Error {
  constructor(t) {
    (super(`Encountered unidirectional transform during encode: ${t}`),
      (this.name = "ZodEncodeError"));
  }
}
const gn = {};
function J(e) {
  return gn;
}
function _n(e) {
  const t = Object.values(e).filter((r) => typeof r == "number");
  return Object.entries(e)
    .filter(([r, o]) => t.indexOf(+r) === -1)
    .map(([r, o]) => o);
}
function Ye(e, t) {
  return typeof t == "bigint" ? t.toString() : t;
}
function nt(e) {
  return {
    get value() {
      {
        const t = e();
        return (Object.defineProperty(this, "value", { value: t }), t);
      }
    },
  };
}
function rt(e) {
  return e == null;
}
function ot(e) {
  const t = e.startsWith("^") ? 1 : 0,
    n = e.endsWith("$") ? e.length - 1 : e.length;
  return e.slice(t, n);
}
function Ko(e, t) {
  const n = (e.toString().split(".")[1] || "").length,
    r = t.toString();
  let o = (r.split(".")[1] || "").length;
  if (o === 0 && /\d?e-\d?/.test(r)) {
    const c = r.match(/\d?e-(\d?)/);
    c?.[1] && (o = Number.parseInt(c[1]));
  }
  const i = n > o ? n : o,
    s = Number.parseInt(e.toFixed(i).replace(".", "")),
    a = Number.parseInt(t.toFixed(i).replace(".", ""));
  return (s % a) / 10 ** i;
}
const $t = Symbol("evaluating");
function y(e, t, n) {
  let r;
  Object.defineProperty(e, t, {
    get() {
      if (r !== $t) return (r === void 0 && ((r = $t), (r = n())), r);
    },
    set(o) {
      Object.defineProperty(e, t, { value: o });
    },
    configurable: !0,
  });
}
function H(e, t, n) {
  Object.defineProperty(e, t, {
    value: n,
    writable: !0,
    enumerable: !0,
    configurable: !0,
  });
}
function j(...e) {
  const t = {};
  for (const n of e) {
    const r = Object.getOwnPropertyDescriptors(n);
    Object.assign(t, r);
  }
  return Object.defineProperties({}, t);
}
function Tt(e) {
  return JSON.stringify(e);
}
function Qo(e) {
  return e
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
const yn =
  "captureStackTrace" in Error ? Error.captureStackTrace : (...e) => {};
function Oe(e) {
  return typeof e == "object" && e !== null && !Array.isArray(e);
}
const es = nt(() => {
  if (typeof navigator < "u" && navigator?.userAgent?.includes("Cloudflare"))
    return !1;
  try {
    const e = Function;
    return (new e(""), !0);
  } catch {
    return !1;
  }
});
function le(e) {
  if (Oe(e) === !1) return !1;
  const t = e.constructor;
  if (t === void 0 || typeof t != "function") return !0;
  const n = t.prototype;
  return !(
    Oe(n) === !1 ||
    Object.prototype.hasOwnProperty.call(n, "isPrototypeOf") === !1
  );
}
function bn(e) {
  return le(e) ? { ...e } : Array.isArray(e) ? [...e] : e;
}
const ts = new Set(["string", "number", "symbol"]);
function Me(e) {
  return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function R(e, t, n) {
  const r = new e._zod.constr(t ?? e._zod.def);
  return ((!t || n?.parent) && (r._zod.parent = e), r);
}
function p(e) {
  const t = e;
  if (!t) return {};
  if (typeof t == "string") return { error: () => t };
  if (t?.message !== void 0) {
    if (t?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    t.error = t.message;
  }
  return (
    delete t.message,
    typeof t.error == "string" ? { ...t, error: () => t.error } : t
  );
}
function ns(e) {
  return Object.keys(e).filter(
    (t) => e[t]._zod.optin === "optional" && e[t]._zod.optout === "optional",
  );
}
const rs = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-34028234663852886e22, 34028234663852886e22],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE],
};
function os(e, t) {
  const n = e._zod.def,
    r = n.checks;
  if (r && r.length > 0)
    throw new Error(
      ".pick() cannot be used on object schemas containing refinements",
    );
  const i = j(e._zod.def, {
    get shape() {
      const s = {};
      for (const a in t) {
        if (!(a in n.shape)) throw new Error(`Unrecognized key: "${a}"`);
        t[a] && (s[a] = n.shape[a]);
      }
      return (H(this, "shape", s), s);
    },
    checks: [],
  });
  return R(e, i);
}
function ss(e, t) {
  const n = e._zod.def,
    r = n.checks;
  if (r && r.length > 0)
    throw new Error(
      ".omit() cannot be used on object schemas containing refinements",
    );
  const i = j(e._zod.def, {
    get shape() {
      const s = { ...e._zod.def.shape };
      for (const a in t) {
        if (!(a in n.shape)) throw new Error(`Unrecognized key: "${a}"`);
        t[a] && delete s[a];
      }
      return (H(this, "shape", s), s);
    },
    checks: [],
  });
  return R(e, i);
}
function is(e, t) {
  if (!le(t))
    throw new Error("Invalid input to extend: expected a plain object");
  const n = e._zod.def.checks;
  if (n && n.length > 0) {
    const i = e._zod.def.shape;
    for (const s in t)
      if (Object.getOwnPropertyDescriptor(i, s) !== void 0)
        throw new Error(
          "Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.",
        );
  }
  const o = j(e._zod.def, {
    get shape() {
      const i = { ...e._zod.def.shape, ...t };
      return (H(this, "shape", i), i);
    },
  });
  return R(e, o);
}
function as(e, t) {
  if (!le(t))
    throw new Error("Invalid input to safeExtend: expected a plain object");
  const n = j(e._zod.def, {
    get shape() {
      const r = { ...e._zod.def.shape, ...t };
      return (H(this, "shape", r), r);
    },
  });
  return R(e, n);
}
function cs(e, t) {
  const n = j(e._zod.def, {
    get shape() {
      const r = { ...e._zod.def.shape, ...t._zod.def.shape };
      return (H(this, "shape", r), r);
    },
    get catchall() {
      return t._zod.def.catchall;
    },
    checks: [],
  });
  return R(e, n);
}
function us(e, t, n) {
  const o = t._zod.def.checks;
  if (o && o.length > 0)
    throw new Error(
      ".partial() cannot be used on object schemas containing refinements",
    );
  const s = j(t._zod.def, {
    get shape() {
      const a = t._zod.def.shape,
        c = { ...a };
      if (n)
        for (const u in n) {
          if (!(u in a)) throw new Error(`Unrecognized key: "${u}"`);
          n[u] &&
            (c[u] = e ? new e({ type: "optional", innerType: a[u] }) : a[u]);
        }
      else
        for (const u in a)
          c[u] = e ? new e({ type: "optional", innerType: a[u] }) : a[u];
      return (H(this, "shape", c), c);
    },
    checks: [],
  });
  return R(t, s);
}
function fs(e, t, n) {
  const r = j(t._zod.def, {
    get shape() {
      const o = t._zod.def.shape,
        i = { ...o };
      if (n)
        for (const s in n) {
          if (!(s in i)) throw new Error(`Unrecognized key: "${s}"`);
          n[s] && (i[s] = new e({ type: "nonoptional", innerType: o[s] }));
        }
      else
        for (const s in o)
          i[s] = new e({ type: "nonoptional", innerType: o[s] });
      return (H(this, "shape", i), i);
    },
  });
  return R(t, r);
}
function q(e, t = 0) {
  if (e.aborted === !0) return !0;
  for (let n = t; n < e.issues.length; n++)
    if (e.issues[n]?.continue !== !0) return !0;
  return !1;
}
function wn(e, t) {
  return t.map((n) => {
    var r;
    return ((r = n).path ?? (r.path = []), n.path.unshift(e), n);
  });
}
function _e(e) {
  return typeof e == "string" ? e : e?.message;
}
function V(e, t, n) {
  const r = { ...e, path: e.path ?? [] };
  if (!e.message) {
    const o =
      _e(e.inst?._zod.def?.error?.(e)) ??
      _e(t?.error?.(e)) ??
      _e(n.customError?.(e)) ??
      _e(n.localeError?.(e)) ??
      "Invalid input";
    r.message = o;
  }
  return (
    delete r.inst,
    delete r.continue,
    t?.reportInput || delete r.input,
    r
  );
}
function st(e) {
  return Array.isArray(e)
    ? "array"
    : typeof e == "string"
      ? "string"
      : "unknown";
}
function de(...e) {
  const [t, n, r] = e;
  return typeof t == "string"
    ? { message: t, code: "custom", input: n, inst: r }
    : { ...t };
}
const vn = (e, t) => {
    ((e.name = "$ZodError"),
      Object.defineProperty(e, "_zod", { value: e._zod, enumerable: !1 }),
      Object.defineProperty(e, "issues", { value: t, enumerable: !1 }),
      (e.message = JSON.stringify(t, Ye, 2)),
      Object.defineProperty(e, "toString", {
        value: () => e.message,
        enumerable: !1,
      }));
  },
  Sn = f("$ZodError", vn),
  kn = f("$ZodError", vn, { Parent: Error });
function ls(e, t = (n) => n.message) {
  const n = {},
    r = [];
  for (const o of e.issues)
    o.path.length > 0
      ? ((n[o.path[0]] = n[o.path[0]] || []), n[o.path[0]].push(t(o)))
      : r.push(t(o));
  return { formErrors: r, fieldErrors: n };
}
function ds(e, t = (n) => n.message) {
  const n = { _errors: [] },
    r = (o) => {
      for (const i of o.issues)
        if (i.code === "invalid_union" && i.errors.length)
          i.errors.map((s) => r({ issues: s }));
        else if (i.code === "invalid_key") r({ issues: i.issues });
        else if (i.code === "invalid_element") r({ issues: i.issues });
        else if (i.path.length === 0) n._errors.push(t(i));
        else {
          let s = n,
            a = 0;
          for (; a < i.path.length; ) {
            const c = i.path[a];
            (a === i.path.length - 1
              ? ((s[c] = s[c] || { _errors: [] }), s[c]._errors.push(t(i)))
              : (s[c] = s[c] || { _errors: [] }),
              (s = s[c]),
              a++);
          }
        }
    };
  return (r(e), n);
}
const it = (e) => (t, n, r, o) => {
    const i = r ? Object.assign(r, { async: !1 }) : { async: !1 },
      s = t._zod.run({ value: n, issues: [] }, i);
    if (s instanceof Promise) throw new K();
    if (s.issues.length) {
      const a = new (o?.Err ?? e)(s.issues.map((c) => V(c, i, J())));
      throw (yn(a, o?.callee), a);
    }
    return s.value;
  },
  at = (e) => async (t, n, r, o) => {
    const i = r ? Object.assign(r, { async: !0 }) : { async: !0 };
    let s = t._zod.run({ value: n, issues: [] }, i);
    if ((s instanceof Promise && (s = await s), s.issues.length)) {
      const a = new (o?.Err ?? e)(s.issues.map((c) => V(c, i, J())));
      throw (yn(a, o?.callee), a);
    }
    return s.value;
  },
  Ie = (e) => (t, n, r) => {
    const o = r ? { ...r, async: !1 } : { async: !1 },
      i = t._zod.run({ value: n, issues: [] }, o);
    if (i instanceof Promise) throw new K();
    return i.issues.length
      ? { success: !1, error: new (e ?? Sn)(i.issues.map((s) => V(s, o, J()))) }
      : { success: !0, data: i.value };
  },
  hs = Ie(kn),
  Ze = (e) => async (t, n, r) => {
    const o = r ? Object.assign(r, { async: !0 }) : { async: !0 };
    let i = t._zod.run({ value: n, issues: [] }, o);
    return (
      i instanceof Promise && (i = await i),
      i.issues.length
        ? { success: !1, error: new e(i.issues.map((s) => V(s, o, J()))) }
        : { success: !0, data: i.value }
    );
  },
  ps = Ze(kn),
  ms = (e) => (t, n, r) => {
    const o = r
      ? Object.assign(r, { direction: "backward" })
      : { direction: "backward" };
    return it(e)(t, n, o);
  },
  gs = (e) => (t, n, r) => it(e)(t, n, r),
  _s = (e) => async (t, n, r) => {
    const o = r
      ? Object.assign(r, { direction: "backward" })
      : { direction: "backward" };
    return at(e)(t, n, o);
  },
  ys = (e) => async (t, n, r) => at(e)(t, n, r),
  bs = (e) => (t, n, r) => {
    const o = r
      ? Object.assign(r, { direction: "backward" })
      : { direction: "backward" };
    return Ie(e)(t, n, o);
  },
  ws = (e) => (t, n, r) => Ie(e)(t, n, r),
  vs = (e) => async (t, n, r) => {
    const o = r
      ? Object.assign(r, { direction: "backward" })
      : { direction: "backward" };
    return Ze(e)(t, n, o);
  },
  Ss = (e) => async (t, n, r) => Ze(e)(t, n, r),
  ks = /^[cC][^\s-]{8,}$/,
  Os = /^[0-9a-z]+$/,
  zs = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/,
  Es = /^[0-9a-vA-V]{20}$/,
  $s = /^[A-Za-z0-9]{27}$/,
  Ts = /^[a-zA-Z0-9_-]{21}$/,
  Ds =
    /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/,
  Ps =
    /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,
  Dt = (e) =>
    e
      ? new RegExp(
          `^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${e}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`,
        )
      : /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/,
  Ms =
    /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/,
  Is = "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";
function Zs() {
  return new RegExp(Is, "u");
}
const Ns =
    /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
  Cs =
    /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/,
  xs =
    /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/,
  As =
    /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
  Fs =
    /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/,
  On = /^[A-Za-z0-9_-]*$/,
  js = /^\+[1-9]\d{6,14}$/,
  zn =
    "(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))",
  Rs = new RegExp(`^${zn}$`);
function En(e) {
  const t = "(?:[01]\\d|2[0-3]):[0-5]\\d";
  return typeof e.precision == "number"
    ? e.precision === -1
      ? `${t}`
      : e.precision === 0
        ? `${t}:[0-5]\\d`
        : `${t}:[0-5]\\d\\.\\d{${e.precision}}`
    : `${t}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function Ls(e) {
  return new RegExp(`^${En(e)}$`);
}
function Us(e) {
  const t = En({ precision: e.precision }),
    n = ["Z"];
  (e.local && n.push(""),
    e.offset && n.push("([+-](?:[01]\\d|2[0-3]):[0-5]\\d)"));
  const r = `${t}(?:${n.join("|")})`;
  return new RegExp(`^${zn}T(?:${r})$`);
}
const Ys = (e) => {
    const t = e
      ? `[\\s\\S]{${e?.minimum ?? 0},${e?.maximum ?? ""}}`
      : "[\\s\\S]*";
    return new RegExp(`^${t}$`);
  },
  Ws = /^-?\d+$/,
  Js = /^-?\d+(?:\.\d+)?$/,
  Vs = /^(?:true|false)$/i,
  Hs = /^[^A-Z]*$/,
  Bs = /^[^a-z]*$/,
  D = f("$ZodCheck", (e, t) => {
    var n;
    (e._zod ?? (e._zod = {}),
      (e._zod.def = t),
      (n = e._zod).onattach ?? (n.onattach = []));
  }),
  $n = { number: "number", bigint: "bigint", object: "date" },
  Tn = f("$ZodCheckLessThan", (e, t) => {
    D.init(e, t);
    const n = $n[typeof t.value];
    (e._zod.onattach.push((r) => {
      const o = r._zod.bag,
        i =
          (t.inclusive ? o.maximum : o.exclusiveMaximum) ??
          Number.POSITIVE_INFINITY;
      t.value < i &&
        (t.inclusive ? (o.maximum = t.value) : (o.exclusiveMaximum = t.value));
    }),
      (e._zod.check = (r) => {
        (t.inclusive ? r.value <= t.value : r.value < t.value) ||
          r.issues.push({
            origin: n,
            code: "too_big",
            maximum: typeof t.value == "object" ? t.value.getTime() : t.value,
            input: r.value,
            inclusive: t.inclusive,
            inst: e,
            continue: !t.abort,
          });
      }));
  }),
  Dn = f("$ZodCheckGreaterThan", (e, t) => {
    D.init(e, t);
    const n = $n[typeof t.value];
    (e._zod.onattach.push((r) => {
      const o = r._zod.bag,
        i =
          (t.inclusive ? o.minimum : o.exclusiveMinimum) ??
          Number.NEGATIVE_INFINITY;
      t.value > i &&
        (t.inclusive ? (o.minimum = t.value) : (o.exclusiveMinimum = t.value));
    }),
      (e._zod.check = (r) => {
        (t.inclusive ? r.value >= t.value : r.value > t.value) ||
          r.issues.push({
            origin: n,
            code: "too_small",
            minimum: typeof t.value == "object" ? t.value.getTime() : t.value,
            input: r.value,
            inclusive: t.inclusive,
            inst: e,
            continue: !t.abort,
          });
      }));
  }),
  Gs = f("$ZodCheckMultipleOf", (e, t) => {
    (D.init(e, t),
      e._zod.onattach.push((n) => {
        var r;
        (r = n._zod.bag).multipleOf ?? (r.multipleOf = t.value);
      }),
      (e._zod.check = (n) => {
        if (typeof n.value != typeof t.value)
          throw new Error("Cannot mix number and bigint in multiple_of check.");
        (typeof n.value == "bigint"
          ? n.value % t.value === BigInt(0)
          : Ko(n.value, t.value) === 0) ||
          n.issues.push({
            origin: typeof n.value,
            code: "not_multiple_of",
            divisor: t.value,
            input: n.value,
            inst: e,
            continue: !t.abort,
          });
      }));
  }),
  Xs = f("$ZodCheckNumberFormat", (e, t) => {
    (D.init(e, t), (t.format = t.format || "float64"));
    const n = t.format?.includes("int"),
      r = n ? "int" : "number",
      [o, i] = rs[t.format];
    (e._zod.onattach.push((s) => {
      const a = s._zod.bag;
      ((a.format = t.format),
        (a.minimum = o),
        (a.maximum = i),
        n && (a.pattern = Ws));
    }),
      (e._zod.check = (s) => {
        const a = s.value;
        if (n) {
          if (!Number.isInteger(a)) {
            s.issues.push({
              expected: r,
              format: t.format,
              code: "invalid_type",
              continue: !1,
              input: a,
              inst: e,
            });
            return;
          }
          if (!Number.isSafeInteger(a)) {
            a > 0
              ? s.issues.push({
                  input: a,
                  code: "too_big",
                  maximum: Number.MAX_SAFE_INTEGER,
                  note: "Integers must be within the safe integer range.",
                  inst: e,
                  origin: r,
                  inclusive: !0,
                  continue: !t.abort,
                })
              : s.issues.push({
                  input: a,
                  code: "too_small",
                  minimum: Number.MIN_SAFE_INTEGER,
                  note: "Integers must be within the safe integer range.",
                  inst: e,
                  origin: r,
                  inclusive: !0,
                  continue: !t.abort,
                });
            return;
          }
        }
        (a < o &&
          s.issues.push({
            origin: "number",
            input: a,
            code: "too_small",
            minimum: o,
            inclusive: !0,
            inst: e,
            continue: !t.abort,
          }),
          a > i &&
            s.issues.push({
              origin: "number",
              input: a,
              code: "too_big",
              maximum: i,
              inclusive: !0,
              inst: e,
              continue: !t.abort,
            }));
      }));
  }),
  qs = f("$ZodCheckMaxLength", (e, t) => {
    var n;
    (D.init(e, t),
      (n = e._zod.def).when ??
        (n.when = (r) => {
          const o = r.value;
          return !rt(o) && o.length !== void 0;
        }),
      e._zod.onattach.push((r) => {
        const o = r._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
        t.maximum < o && (r._zod.bag.maximum = t.maximum);
      }),
      (e._zod.check = (r) => {
        const o = r.value;
        if (o.length <= t.maximum) return;
        const s = st(o);
        r.issues.push({
          origin: s,
          code: "too_big",
          maximum: t.maximum,
          inclusive: !0,
          input: o,
          inst: e,
          continue: !t.abort,
        });
      }));
  }),
  Ks = f("$ZodCheckMinLength", (e, t) => {
    var n;
    (D.init(e, t),
      (n = e._zod.def).when ??
        (n.when = (r) => {
          const o = r.value;
          return !rt(o) && o.length !== void 0;
        }),
      e._zod.onattach.push((r) => {
        const o = r._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
        t.minimum > o && (r._zod.bag.minimum = t.minimum);
      }),
      (e._zod.check = (r) => {
        const o = r.value;
        if (o.length >= t.minimum) return;
        const s = st(o);
        r.issues.push({
          origin: s,
          code: "too_small",
          minimum: t.minimum,
          inclusive: !0,
          input: o,
          inst: e,
          continue: !t.abort,
        });
      }));
  }),
  Qs = f("$ZodCheckLengthEquals", (e, t) => {
    var n;
    (D.init(e, t),
      (n = e._zod.def).when ??
        (n.when = (r) => {
          const o = r.value;
          return !rt(o) && o.length !== void 0;
        }),
      e._zod.onattach.push((r) => {
        const o = r._zod.bag;
        ((o.minimum = t.length), (o.maximum = t.length), (o.length = t.length));
      }),
      (e._zod.check = (r) => {
        const o = r.value,
          i = o.length;
        if (i === t.length) return;
        const s = st(o),
          a = i > t.length;
        r.issues.push({
          origin: s,
          ...(a
            ? { code: "too_big", maximum: t.length }
            : { code: "too_small", minimum: t.length }),
          inclusive: !0,
          exact: !0,
          input: r.value,
          inst: e,
          continue: !t.abort,
        });
      }));
  }),
  Ne = f("$ZodCheckStringFormat", (e, t) => {
    var n, r;
    (D.init(e, t),
      e._zod.onattach.push((o) => {
        const i = o._zod.bag;
        ((i.format = t.format),
          t.pattern &&
            (i.patterns ?? (i.patterns = new Set()),
            i.patterns.add(t.pattern)));
      }),
      t.pattern
        ? ((n = e._zod).check ??
          (n.check = (o) => {
            ((t.pattern.lastIndex = 0),
              !t.pattern.test(o.value) &&
                o.issues.push({
                  origin: "string",
                  code: "invalid_format",
                  format: t.format,
                  input: o.value,
                  ...(t.pattern ? { pattern: t.pattern.toString() } : {}),
                  inst: e,
                  continue: !t.abort,
                }));
          }))
        : ((r = e._zod).check ?? (r.check = () => {})));
  }),
  ei = f("$ZodCheckRegex", (e, t) => {
    (Ne.init(e, t),
      (e._zod.check = (n) => {
        ((t.pattern.lastIndex = 0),
          !t.pattern.test(n.value) &&
            n.issues.push({
              origin: "string",
              code: "invalid_format",
              format: "regex",
              input: n.value,
              pattern: t.pattern.toString(),
              inst: e,
              continue: !t.abort,
            }));
      }));
  }),
  ti = f("$ZodCheckLowerCase", (e, t) => {
    (t.pattern ?? (t.pattern = Hs), Ne.init(e, t));
  }),
  ni = f("$ZodCheckUpperCase", (e, t) => {
    (t.pattern ?? (t.pattern = Bs), Ne.init(e, t));
  }),
  ri = f("$ZodCheckIncludes", (e, t) => {
    D.init(e, t);
    const n = Me(t.includes),
      r = new RegExp(
        typeof t.position == "number" ? `^.{${t.position}}${n}` : n,
      );
    ((t.pattern = r),
      e._zod.onattach.push((o) => {
        const i = o._zod.bag;
        (i.patterns ?? (i.patterns = new Set()), i.patterns.add(r));
      }),
      (e._zod.check = (o) => {
        o.value.includes(t.includes, t.position) ||
          o.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "includes",
            includes: t.includes,
            input: o.value,
            inst: e,
            continue: !t.abort,
          });
      }));
  }),
  oi = f("$ZodCheckStartsWith", (e, t) => {
    D.init(e, t);
    const n = new RegExp(`^${Me(t.prefix)}.*`);
    (t.pattern ?? (t.pattern = n),
      e._zod.onattach.push((r) => {
        const o = r._zod.bag;
        (o.patterns ?? (o.patterns = new Set()), o.patterns.add(n));
      }),
      (e._zod.check = (r) => {
        r.value.startsWith(t.prefix) ||
          r.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "starts_with",
            prefix: t.prefix,
            input: r.value,
            inst: e,
            continue: !t.abort,
          });
      }));
  }),
  si = f("$ZodCheckEndsWith", (e, t) => {
    D.init(e, t);
    const n = new RegExp(`.*${Me(t.suffix)}$`);
    (t.pattern ?? (t.pattern = n),
      e._zod.onattach.push((r) => {
        const o = r._zod.bag;
        (o.patterns ?? (o.patterns = new Set()), o.patterns.add(n));
      }),
      (e._zod.check = (r) => {
        r.value.endsWith(t.suffix) ||
          r.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "ends_with",
            suffix: t.suffix,
            input: r.value,
            inst: e,
            continue: !t.abort,
          });
      }));
  }),
  ii = f("$ZodCheckOverwrite", (e, t) => {
    (D.init(e, t),
      (e._zod.check = (n) => {
        n.value = t.tx(n.value);
      }));
  });
class ai {
  constructor(t = []) {
    ((this.content = []), (this.indent = 0), this && (this.args = t));
  }
  indented(t) {
    ((this.indent += 1), t(this), (this.indent -= 1));
  }
  write(t) {
    if (typeof t == "function") {
      (t(this, { execution: "sync" }), t(this, { execution: "async" }));
      return;
    }
    const r = t
        .split(
          `
`,
        )
        .filter((s) => s),
      o = Math.min(...r.map((s) => s.length - s.trimStart().length)),
      i = r.map((s) => s.slice(o)).map((s) => " ".repeat(this.indent * 2) + s);
    for (const s of i) this.content.push(s);
  }
  compile() {
    const t = Function,
      n = this?.args,
      o = [...(this?.content ?? [""]).map((i) => `  ${i}`)];
    return new t(
      ...n,
      o.join(`
`),
    );
  }
}
const ci = { major: 4, minor: 3, patch: 6 },
  O = f("$ZodType", (e, t) => {
    var n;
    (e ?? (e = {}),
      (e._zod.def = t),
      (e._zod.bag = e._zod.bag || {}),
      (e._zod.version = ci));
    const r = [...(e._zod.def.checks ?? [])];
    e._zod.traits.has("$ZodCheck") && r.unshift(e);
    for (const o of r) for (const i of o._zod.onattach) i(e);
    if (r.length === 0)
      ((n = e._zod).deferred ?? (n.deferred = []),
        e._zod.deferred?.push(() => {
          e._zod.run = e._zod.parse;
        }));
    else {
      const o = (s, a, c) => {
          let u = q(s),
            l;
          for (const d of a) {
            if (d._zod.def.when) {
              if (!d._zod.def.when(s)) continue;
            } else if (u) continue;
            const h = s.issues.length,
              m = d._zod.check(s);
            if (m instanceof Promise && c?.async === !1) throw new K();
            if (l || m instanceof Promise)
              l = (l ?? Promise.resolve()).then(async () => {
                (await m, s.issues.length !== h && (u || (u = q(s, h))));
              });
            else {
              if (s.issues.length === h) continue;
              u || (u = q(s, h));
            }
          }
          return l ? l.then(() => s) : s;
        },
        i = (s, a, c) => {
          if (q(s)) return ((s.aborted = !0), s);
          const u = o(a, r, c);
          if (u instanceof Promise) {
            if (c.async === !1) throw new K();
            return u.then((l) => e._zod.parse(l, c));
          }
          return e._zod.parse(u, c);
        };
      e._zod.run = (s, a) => {
        if (a.skipChecks) return e._zod.parse(s, a);
        if (a.direction === "backward") {
          const u = e._zod.parse(
            { value: s.value, issues: [] },
            { ...a, skipChecks: !0 },
          );
          return u instanceof Promise ? u.then((l) => i(l, s, a)) : i(u, s, a);
        }
        const c = e._zod.parse(s, a);
        if (c instanceof Promise) {
          if (a.async === !1) throw new K();
          return c.then((u) => o(u, r, a));
        }
        return o(c, r, a);
      };
    }
    y(e, "~standard", () => ({
      validate: (o) => {
        try {
          const i = hs(e, o);
          return i.success ? { value: i.data } : { issues: i.error?.issues };
        } catch {
          return ps(e, o).then((s) =>
            s.success ? { value: s.data } : { issues: s.error?.issues },
          );
        }
      },
      vendor: "zod",
      version: 1,
    }));
  }),
  ct = f("$ZodString", (e, t) => {
    (O.init(e, t),
      (e._zod.pattern =
        [...(e?._zod.bag?.patterns ?? [])].pop() ?? Ys(e._zod.bag)),
      (e._zod.parse = (n, r) => {
        if (t.coerce)
          try {
            n.value = String(n.value);
          } catch {}
        return (
          typeof n.value == "string" ||
            n.issues.push({
              expected: "string",
              code: "invalid_type",
              input: n.value,
              inst: e,
            }),
          n
        );
      }));
  }),
  w = f("$ZodStringFormat", (e, t) => {
    (Ne.init(e, t), ct.init(e, t));
  }),
  ui = f("$ZodGUID", (e, t) => {
    (t.pattern ?? (t.pattern = Ps), w.init(e, t));
  }),
  fi = f("$ZodUUID", (e, t) => {
    if (t.version) {
      const r = { v1: 1, v2: 2, v3: 3, v4: 4, v5: 5, v6: 6, v7: 7, v8: 8 }[
        t.version
      ];
      if (r === void 0) throw new Error(`Invalid UUID version: "${t.version}"`);
      t.pattern ?? (t.pattern = Dt(r));
    } else t.pattern ?? (t.pattern = Dt());
    w.init(e, t);
  }),
  li = f("$ZodEmail", (e, t) => {
    (t.pattern ?? (t.pattern = Ms), w.init(e, t));
  }),
  di = f("$ZodURL", (e, t) => {
    (w.init(e, t),
      (e._zod.check = (n) => {
        try {
          const r = n.value.trim(),
            o = new URL(r);
          (t.hostname &&
            ((t.hostname.lastIndex = 0),
            t.hostname.test(o.hostname) ||
              n.issues.push({
                code: "invalid_format",
                format: "url",
                note: "Invalid hostname",
                pattern: t.hostname.source,
                input: n.value,
                inst: e,
                continue: !t.abort,
              })),
            t.protocol &&
              ((t.protocol.lastIndex = 0),
              t.protocol.test(
                o.protocol.endsWith(":") ? o.protocol.slice(0, -1) : o.protocol,
              ) ||
                n.issues.push({
                  code: "invalid_format",
                  format: "url",
                  note: "Invalid protocol",
                  pattern: t.protocol.source,
                  input: n.value,
                  inst: e,
                  continue: !t.abort,
                })),
            t.normalize ? (n.value = o.href) : (n.value = r));
          return;
        } catch {
          n.issues.push({
            code: "invalid_format",
            format: "url",
            input: n.value,
            inst: e,
            continue: !t.abort,
          });
        }
      }));
  }),
  hi = f("$ZodEmoji", (e, t) => {
    (t.pattern ?? (t.pattern = Zs()), w.init(e, t));
  }),
  pi = f("$ZodNanoID", (e, t) => {
    (t.pattern ?? (t.pattern = Ts), w.init(e, t));
  }),
  mi = f("$ZodCUID", (e, t) => {
    (t.pattern ?? (t.pattern = ks), w.init(e, t));
  }),
  gi = f("$ZodCUID2", (e, t) => {
    (t.pattern ?? (t.pattern = Os), w.init(e, t));
  }),
  _i = f("$ZodULID", (e, t) => {
    (t.pattern ?? (t.pattern = zs), w.init(e, t));
  }),
  yi = f("$ZodXID", (e, t) => {
    (t.pattern ?? (t.pattern = Es), w.init(e, t));
  }),
  bi = f("$ZodKSUID", (e, t) => {
    (t.pattern ?? (t.pattern = $s), w.init(e, t));
  }),
  wi = f("$ZodISODateTime", (e, t) => {
    (t.pattern ?? (t.pattern = Us(t)), w.init(e, t));
  }),
  vi = f("$ZodISODate", (e, t) => {
    (t.pattern ?? (t.pattern = Rs), w.init(e, t));
  }),
  Si = f("$ZodISOTime", (e, t) => {
    (t.pattern ?? (t.pattern = Ls(t)), w.init(e, t));
  }),
  ki = f("$ZodISODuration", (e, t) => {
    (t.pattern ?? (t.pattern = Ds), w.init(e, t));
  }),
  Oi = f("$ZodIPv4", (e, t) => {
    (t.pattern ?? (t.pattern = Ns), w.init(e, t), (e._zod.bag.format = "ipv4"));
  }),
  zi = f("$ZodIPv6", (e, t) => {
    (t.pattern ?? (t.pattern = Cs),
      w.init(e, t),
      (e._zod.bag.format = "ipv6"),
      (e._zod.check = (n) => {
        try {
          new URL(`http://[${n.value}]`);
        } catch {
          n.issues.push({
            code: "invalid_format",
            format: "ipv6",
            input: n.value,
            inst: e,
            continue: !t.abort,
          });
        }
      }));
  }),
  Ei = f("$ZodCIDRv4", (e, t) => {
    (t.pattern ?? (t.pattern = xs), w.init(e, t));
  }),
  $i = f("$ZodCIDRv6", (e, t) => {
    (t.pattern ?? (t.pattern = As),
      w.init(e, t),
      (e._zod.check = (n) => {
        const r = n.value.split("/");
        try {
          if (r.length !== 2) throw new Error();
          const [o, i] = r;
          if (!i) throw new Error();
          const s = Number(i);
          if (`${s}` !== i) throw new Error();
          if (s < 0 || s > 128) throw new Error();
          new URL(`http://[${o}]`);
        } catch {
          n.issues.push({
            code: "invalid_format",
            format: "cidrv6",
            input: n.value,
            inst: e,
            continue: !t.abort,
          });
        }
      }));
  });
function Pn(e) {
  if (e === "") return !0;
  if (e.length % 4 !== 0) return !1;
  try {
    return (atob(e), !0);
  } catch {
    return !1;
  }
}
const Ti = f("$ZodBase64", (e, t) => {
  (t.pattern ?? (t.pattern = Fs),
    w.init(e, t),
    (e._zod.bag.contentEncoding = "base64"),
    (e._zod.check = (n) => {
      Pn(n.value) ||
        n.issues.push({
          code: "invalid_format",
          format: "base64",
          input: n.value,
          inst: e,
          continue: !t.abort,
        });
    }));
});
function Di(e) {
  if (!On.test(e)) return !1;
  const t = e.replace(/[-_]/g, (r) => (r === "-" ? "+" : "/")),
    n = t.padEnd(Math.ceil(t.length / 4) * 4, "=");
  return Pn(n);
}
const Pi = f("$ZodBase64URL", (e, t) => {
    (t.pattern ?? (t.pattern = On),
      w.init(e, t),
      (e._zod.bag.contentEncoding = "base64url"),
      (e._zod.check = (n) => {
        Di(n.value) ||
          n.issues.push({
            code: "invalid_format",
            format: "base64url",
            input: n.value,
            inst: e,
            continue: !t.abort,
          });
      }));
  }),
  Mi = f("$ZodE164", (e, t) => {
    (t.pattern ?? (t.pattern = js), w.init(e, t));
  });
function Ii(e, t = null) {
  try {
    const n = e.split(".");
    if (n.length !== 3) return !1;
    const [r] = n;
    if (!r) return !1;
    const o = JSON.parse(atob(r));
    return !(
      ("typ" in o && o?.typ !== "JWT") ||
      !o.alg ||
      (t && (!("alg" in o) || o.alg !== t))
    );
  } catch {
    return !1;
  }
}
const Zi = f("$ZodJWT", (e, t) => {
    (w.init(e, t),
      (e._zod.check = (n) => {
        Ii(n.value, t.alg) ||
          n.issues.push({
            code: "invalid_format",
            format: "jwt",
            input: n.value,
            inst: e,
            continue: !t.abort,
          });
      }));
  }),
  Mn = f("$ZodNumber", (e, t) => {
    (O.init(e, t),
      (e._zod.pattern = e._zod.bag.pattern ?? Js),
      (e._zod.parse = (n, r) => {
        if (t.coerce)
          try {
            n.value = Number(n.value);
          } catch {}
        const o = n.value;
        if (typeof o == "number" && !Number.isNaN(o) && Number.isFinite(o))
          return n;
        const i =
          typeof o == "number"
            ? Number.isNaN(o)
              ? "NaN"
              : Number.isFinite(o)
                ? void 0
                : "Infinity"
            : void 0;
        return (
          n.issues.push({
            expected: "number",
            code: "invalid_type",
            input: o,
            inst: e,
            ...(i ? { received: i } : {}),
          }),
          n
        );
      }));
  }),
  Ni = f("$ZodNumberFormat", (e, t) => {
    (Xs.init(e, t), Mn.init(e, t));
  }),
  Ci = f("$ZodBoolean", (e, t) => {
    (O.init(e, t),
      (e._zod.pattern = Vs),
      (e._zod.parse = (n, r) => {
        if (t.coerce)
          try {
            n.value = !!n.value;
          } catch {}
        const o = n.value;
        return (
          typeof o == "boolean" ||
            n.issues.push({
              expected: "boolean",
              code: "invalid_type",
              input: o,
              inst: e,
            }),
          n
        );
      }));
  }),
  xi = f("$ZodAny", (e, t) => {
    (O.init(e, t), (e._zod.parse = (n) => n));
  }),
  Ai = f("$ZodUnknown", (e, t) => {
    (O.init(e, t), (e._zod.parse = (n) => n));
  }),
  Fi = f("$ZodNever", (e, t) => {
    (O.init(e, t),
      (e._zod.parse = (n, r) => (
        n.issues.push({
          expected: "never",
          code: "invalid_type",
          input: n.value,
          inst: e,
        }),
        n
      )));
  });
function Pt(e, t, n) {
  (e.issues.length && t.issues.push(...wn(n, e.issues)),
    (t.value[n] = e.value));
}
const ji = f("$ZodArray", (e, t) => {
  (O.init(e, t),
    (e._zod.parse = (n, r) => {
      const o = n.value;
      if (!Array.isArray(o))
        return (
          n.issues.push({
            expected: "array",
            code: "invalid_type",
            input: o,
            inst: e,
          }),
          n
        );
      n.value = Array(o.length);
      const i = [];
      for (let s = 0; s < o.length; s++) {
        const a = o[s],
          c = t.element._zod.run({ value: a, issues: [] }, r);
        c instanceof Promise ? i.push(c.then((u) => Pt(u, n, s))) : Pt(c, n, s);
      }
      return i.length ? Promise.all(i).then(() => n) : n;
    }));
});
function ze(e, t, n, r, o) {
  if (e.issues.length) {
    if (o && !(n in r)) return;
    t.issues.push(...wn(n, e.issues));
  }
  e.value === void 0 ? n in r && (t.value[n] = void 0) : (t.value[n] = e.value);
}
function In(e) {
  const t = Object.keys(e.shape);
  for (const r of t)
    if (!e.shape?.[r]?._zod?.traits?.has("$ZodType"))
      throw new Error(`Invalid element at key "${r}": expected a Zod schema`);
  const n = ns(e.shape);
  return {
    ...e,
    keys: t,
    keySet: new Set(t),
    numKeys: t.length,
    optionalKeys: new Set(n),
  };
}
function Zn(e, t, n, r, o, i) {
  const s = [],
    a = o.keySet,
    c = o.catchall._zod,
    u = c.def.type,
    l = c.optout === "optional";
  for (const d in t) {
    if (a.has(d)) continue;
    if (u === "never") {
      s.push(d);
      continue;
    }
    const h = c.run({ value: t[d], issues: [] }, r);
    h instanceof Promise
      ? e.push(h.then((m) => ze(m, n, d, t, l)))
      : ze(h, n, d, t, l);
  }
  return (
    s.length &&
      n.issues.push({ code: "unrecognized_keys", keys: s, input: t, inst: i }),
    e.length ? Promise.all(e).then(() => n) : n
  );
}
const Ri = f("$ZodObject", (e, t) => {
    if ((O.init(e, t), !Object.getOwnPropertyDescriptor(t, "shape")?.get)) {
      const a = t.shape;
      Object.defineProperty(t, "shape", {
        get: () => {
          const c = { ...a };
          return (Object.defineProperty(t, "shape", { value: c }), c);
        },
      });
    }
    const r = nt(() => In(t));
    y(e._zod, "propValues", () => {
      const a = t.shape,
        c = {};
      for (const u in a) {
        const l = a[u]._zod;
        if (l.values) {
          c[u] ?? (c[u] = new Set());
          for (const d of l.values) c[u].add(d);
        }
      }
      return c;
    });
    const o = Oe,
      i = t.catchall;
    let s;
    e._zod.parse = (a, c) => {
      s ?? (s = r.value);
      const u = a.value;
      if (!o(u))
        return (
          a.issues.push({
            expected: "object",
            code: "invalid_type",
            input: u,
            inst: e,
          }),
          a
        );
      a.value = {};
      const l = [],
        d = s.shape;
      for (const h of s.keys) {
        const m = d[h],
          b = m._zod.optout === "optional",
          v = m._zod.run({ value: u[h], issues: [] }, c);
        v instanceof Promise
          ? l.push(v.then((B) => ze(B, a, h, u, b)))
          : ze(v, a, h, u, b);
      }
      return i
        ? Zn(l, u, a, c, r.value, e)
        : l.length
          ? Promise.all(l).then(() => a)
          : a;
    };
  }),
  Li = f("$ZodObjectJIT", (e, t) => {
    Ri.init(e, t);
    const n = e._zod.parse,
      r = nt(() => In(t)),
      o = (h) => {
        const m = new ai(["shape", "payload", "ctx"]),
          b = r.value,
          v = (P) => {
            const E = Tt(P);
            return `shape[${E}]._zod.run({ value: input[${E}], issues: [] }, ctx)`;
          };
        m.write("const input = payload.value;");
        const B = Object.create(null);
        let pe = 0;
        for (const P of b.keys) B[P] = `key_${pe++}`;
        m.write("const newResult = {};");
        for (const P of b.keys) {
          const E = B[P],
            I = Tt(P),
            Vn = h[P]?._zod?.optout === "optional";
          (m.write(`const ${E} = ${v(P)};`),
            Vn
              ? m.write(`
        if (${E}.issues.length) {
          if (${I} in input) {
            payload.issues = payload.issues.concat(${E}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${I}, ...iss.path] : [${I}]
            })));
          }
        }
        
        if (${E}.value === undefined) {
          if (${I} in input) {
            newResult[${I}] = undefined;
          }
        } else {
          newResult[${I}] = ${E}.value;
        }
        
      `)
              : m.write(`
        if (${E}.issues.length) {
          payload.issues = payload.issues.concat(${E}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${I}, ...iss.path] : [${I}]
          })));
        }
        
        if (${E}.value === undefined) {
          if (${I} in input) {
            newResult[${I}] = undefined;
          }
        } else {
          newResult[${I}] = ${E}.value;
        }
        
      `));
        }
        (m.write("payload.value = newResult;"), m.write("return payload;"));
        const re = m.compile();
        return (P, E) => re(h, P, E);
      };
    let i;
    const s = Oe,
      a = !gn.jitless,
      u = a && es.value,
      l = t.catchall;
    let d;
    e._zod.parse = (h, m) => {
      d ?? (d = r.value);
      const b = h.value;
      return s(b)
        ? a && u && m?.async === !1 && m.jitless !== !0
          ? (i || (i = o(t.shape)),
            (h = i(h, m)),
            l ? Zn([], b, h, m, d, e) : h)
          : n(h, m)
        : (h.issues.push({
            expected: "object",
            code: "invalid_type",
            input: b,
            inst: e,
          }),
          h);
    };
  });
function Mt(e, t, n, r) {
  for (const i of e) if (i.issues.length === 0) return ((t.value = i.value), t);
  const o = e.filter((i) => !q(i));
  return o.length === 1
    ? ((t.value = o[0].value), o[0])
    : (t.issues.push({
        code: "invalid_union",
        input: t.value,
        inst: n,
        errors: e.map((i) => i.issues.map((s) => V(s, r, J()))),
      }),
      t);
}
const Ui = f("$ZodUnion", (e, t) => {
    (O.init(e, t),
      y(e._zod, "optin", () =>
        t.options.some((o) => o._zod.optin === "optional")
          ? "optional"
          : void 0,
      ),
      y(e._zod, "optout", () =>
        t.options.some((o) => o._zod.optout === "optional")
          ? "optional"
          : void 0,
      ),
      y(e._zod, "values", () => {
        if (t.options.every((o) => o._zod.values))
          return new Set(t.options.flatMap((o) => Array.from(o._zod.values)));
      }),
      y(e._zod, "pattern", () => {
        if (t.options.every((o) => o._zod.pattern)) {
          const o = t.options.map((i) => i._zod.pattern);
          return new RegExp(`^(${o.map((i) => ot(i.source)).join("|")})$`);
        }
      }));
    const n = t.options.length === 1,
      r = t.options[0]._zod.run;
    e._zod.parse = (o, i) => {
      if (n) return r(o, i);
      let s = !1;
      const a = [];
      for (const c of t.options) {
        const u = c._zod.run({ value: o.value, issues: [] }, i);
        if (u instanceof Promise) (a.push(u), (s = !0));
        else {
          if (u.issues.length === 0) return u;
          a.push(u);
        }
      }
      return s ? Promise.all(a).then((c) => Mt(c, o, e, i)) : Mt(a, o, e, i);
    };
  }),
  Yi = f("$ZodIntersection", (e, t) => {
    (O.init(e, t),
      (e._zod.parse = (n, r) => {
        const o = n.value,
          i = t.left._zod.run({ value: o, issues: [] }, r),
          s = t.right._zod.run({ value: o, issues: [] }, r);
        return i instanceof Promise || s instanceof Promise
          ? Promise.all([i, s]).then(([c, u]) => It(n, c, u))
          : It(n, i, s);
      }));
  });
function We(e, t) {
  if (e === t) return { valid: !0, data: e };
  if (e instanceof Date && t instanceof Date && +e == +t)
    return { valid: !0, data: e };
  if (le(e) && le(t)) {
    const n = Object.keys(t),
      r = Object.keys(e).filter((i) => n.indexOf(i) !== -1),
      o = { ...e, ...t };
    for (const i of r) {
      const s = We(e[i], t[i]);
      if (!s.valid)
        return { valid: !1, mergeErrorPath: [i, ...s.mergeErrorPath] };
      o[i] = s.data;
    }
    return { valid: !0, data: o };
  }
  if (Array.isArray(e) && Array.isArray(t)) {
    if (e.length !== t.length) return { valid: !1, mergeErrorPath: [] };
    const n = [];
    for (let r = 0; r < e.length; r++) {
      const o = e[r],
        i = t[r],
        s = We(o, i);
      if (!s.valid)
        return { valid: !1, mergeErrorPath: [r, ...s.mergeErrorPath] };
      n.push(s.data);
    }
    return { valid: !0, data: n };
  }
  return { valid: !1, mergeErrorPath: [] };
}
function It(e, t, n) {
  const r = new Map();
  let o;
  for (const a of t.issues)
    if (a.code === "unrecognized_keys") {
      o ?? (o = a);
      for (const c of a.keys) (r.has(c) || r.set(c, {}), (r.get(c).l = !0));
    } else e.issues.push(a);
  for (const a of n.issues)
    if (a.code === "unrecognized_keys")
      for (const c of a.keys) (r.has(c) || r.set(c, {}), (r.get(c).r = !0));
    else e.issues.push(a);
  const i = [...r].filter(([, a]) => a.l && a.r).map(([a]) => a);
  if ((i.length && o && e.issues.push({ ...o, keys: i }), q(e))) return e;
  const s = We(t.value, n.value);
  if (!s.valid)
    throw new Error(
      `Unmergable intersection. Error path: ${JSON.stringify(s.mergeErrorPath)}`,
    );
  return ((e.value = s.data), e);
}
const Wi = f("$ZodEnum", (e, t) => {
    O.init(e, t);
    const n = _n(t.entries),
      r = new Set(n);
    ((e._zod.values = r),
      (e._zod.pattern = new RegExp(
        `^(${n
          .filter((o) => ts.has(typeof o))
          .map((o) => (typeof o == "string" ? Me(o) : o.toString()))
          .join("|")})$`,
      )),
      (e._zod.parse = (o, i) => {
        const s = o.value;
        return (
          r.has(s) ||
            o.issues.push({
              code: "invalid_value",
              values: n,
              input: s,
              inst: e,
            }),
          o
        );
      }));
  }),
  Ji = f("$ZodTransform", (e, t) => {
    (O.init(e, t),
      (e._zod.parse = (n, r) => {
        if (r.direction === "backward") throw new mn(e.constructor.name);
        const o = t.transform(n.value, n);
        if (r.async)
          return (o instanceof Promise ? o : Promise.resolve(o)).then(
            (s) => ((n.value = s), n),
          );
        if (o instanceof Promise) throw new K();
        return ((n.value = o), n);
      }));
  });
function Zt(e, t) {
  return e.issues.length && t === void 0 ? { issues: [], value: void 0 } : e;
}
const Nn = f("$ZodOptional", (e, t) => {
    (O.init(e, t),
      (e._zod.optin = "optional"),
      (e._zod.optout = "optional"),
      y(e._zod, "values", () =>
        t.innerType._zod.values
          ? new Set([...t.innerType._zod.values, void 0])
          : void 0,
      ),
      y(e._zod, "pattern", () => {
        const n = t.innerType._zod.pattern;
        return n ? new RegExp(`^(${ot(n.source)})?$`) : void 0;
      }),
      (e._zod.parse = (n, r) => {
        if (t.innerType._zod.optin === "optional") {
          const o = t.innerType._zod.run(n, r);
          return o instanceof Promise
            ? o.then((i) => Zt(i, n.value))
            : Zt(o, n.value);
        }
        return n.value === void 0 ? n : t.innerType._zod.run(n, r);
      }));
  }),
  Vi = f("$ZodExactOptional", (e, t) => {
    (Nn.init(e, t),
      y(e._zod, "values", () => t.innerType._zod.values),
      y(e._zod, "pattern", () => t.innerType._zod.pattern),
      (e._zod.parse = (n, r) => t.innerType._zod.run(n, r)));
  }),
  Hi = f("$ZodNullable", (e, t) => {
    (O.init(e, t),
      y(e._zod, "optin", () => t.innerType._zod.optin),
      y(e._zod, "optout", () => t.innerType._zod.optout),
      y(e._zod, "pattern", () => {
        const n = t.innerType._zod.pattern;
        return n ? new RegExp(`^(${ot(n.source)}|null)$`) : void 0;
      }),
      y(e._zod, "values", () =>
        t.innerType._zod.values
          ? new Set([...t.innerType._zod.values, null])
          : void 0,
      ),
      (e._zod.parse = (n, r) =>
        n.value === null ? n : t.innerType._zod.run(n, r)));
  }),
  Bi = f("$ZodDefault", (e, t) => {
    (O.init(e, t),
      (e._zod.optin = "optional"),
      y(e._zod, "values", () => t.innerType._zod.values),
      (e._zod.parse = (n, r) => {
        if (r.direction === "backward") return t.innerType._zod.run(n, r);
        if (n.value === void 0) return ((n.value = t.defaultValue), n);
        const o = t.innerType._zod.run(n, r);
        return o instanceof Promise ? o.then((i) => Nt(i, t)) : Nt(o, t);
      }));
  });
function Nt(e, t) {
  return (e.value === void 0 && (e.value = t.defaultValue), e);
}
const Gi = f("$ZodPrefault", (e, t) => {
    (O.init(e, t),
      (e._zod.optin = "optional"),
      y(e._zod, "values", () => t.innerType._zod.values),
      (e._zod.parse = (n, r) => (
        r.direction === "backward" ||
          (n.value === void 0 && (n.value = t.defaultValue)),
        t.innerType._zod.run(n, r)
      )));
  }),
  Xi = f("$ZodNonOptional", (e, t) => {
    (O.init(e, t),
      y(e._zod, "values", () => {
        const n = t.innerType._zod.values;
        return n ? new Set([...n].filter((r) => r !== void 0)) : void 0;
      }),
      (e._zod.parse = (n, r) => {
        const o = t.innerType._zod.run(n, r);
        return o instanceof Promise ? o.then((i) => Ct(i, e)) : Ct(o, e);
      }));
  });
function Ct(e, t) {
  return (
    !e.issues.length &&
      e.value === void 0 &&
      e.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: e.value,
        inst: t,
      }),
    e
  );
}
const qi = f("$ZodCatch", (e, t) => {
    (O.init(e, t),
      y(e._zod, "optin", () => t.innerType._zod.optin),
      y(e._zod, "optout", () => t.innerType._zod.optout),
      y(e._zod, "values", () => t.innerType._zod.values),
      (e._zod.parse = (n, r) => {
        if (r.direction === "backward") return t.innerType._zod.run(n, r);
        const o = t.innerType._zod.run(n, r);
        return o instanceof Promise
          ? o.then(
              (i) => (
                (n.value = i.value),
                i.issues.length &&
                  ((n.value = t.catchValue({
                    ...n,
                    error: { issues: i.issues.map((s) => V(s, r, J())) },
                    input: n.value,
                  })),
                  (n.issues = [])),
                n
              ),
            )
          : ((n.value = o.value),
            o.issues.length &&
              ((n.value = t.catchValue({
                ...n,
                error: { issues: o.issues.map((i) => V(i, r, J())) },
                input: n.value,
              })),
              (n.issues = [])),
            n);
      }));
  }),
  Ki = f("$ZodPipe", (e, t) => {
    (O.init(e, t),
      y(e._zod, "values", () => t.in._zod.values),
      y(e._zod, "optin", () => t.in._zod.optin),
      y(e._zod, "optout", () => t.out._zod.optout),
      y(e._zod, "propValues", () => t.in._zod.propValues),
      (e._zod.parse = (n, r) => {
        if (r.direction === "backward") {
          const i = t.out._zod.run(n, r);
          return i instanceof Promise
            ? i.then((s) => ye(s, t.in, r))
            : ye(i, t.in, r);
        }
        const o = t.in._zod.run(n, r);
        return o instanceof Promise
          ? o.then((i) => ye(i, t.out, r))
          : ye(o, t.out, r);
      }));
  });
function ye(e, t, n) {
  return e.issues.length
    ? ((e.aborted = !0), e)
    : t._zod.run({ value: e.value, issues: e.issues }, n);
}
const Qi = f("$ZodReadonly", (e, t) => {
  (O.init(e, t),
    y(e._zod, "propValues", () => t.innerType._zod.propValues),
    y(e._zod, "values", () => t.innerType._zod.values),
    y(e._zod, "optin", () => t.innerType?._zod?.optin),
    y(e._zod, "optout", () => t.innerType?._zod?.optout),
    (e._zod.parse = (n, r) => {
      if (r.direction === "backward") return t.innerType._zod.run(n, r);
      const o = t.innerType._zod.run(n, r);
      return o instanceof Promise ? o.then(xt) : xt(o);
    }));
});
function xt(e) {
  return ((e.value = Object.freeze(e.value)), e);
}
const ea = f("$ZodCustom", (e, t) => {
  (D.init(e, t),
    O.init(e, t),
    (e._zod.parse = (n, r) => n),
    (e._zod.check = (n) => {
      const r = n.value,
        o = t.fn(r);
      if (o instanceof Promise) return o.then((i) => At(i, n, r, e));
      At(o, n, r, e);
    }));
});
function At(e, t, n, r) {
  if (!e) {
    const o = {
      code: "custom",
      input: n,
      inst: r,
      path: [...(r._zod.def.path ?? [])],
      continue: !r._zod.def.abort,
    };
    (r._zod.def.params && (o.params = r._zod.def.params), t.issues.push(de(o)));
  }
}
var Ft;
class ta {
  constructor() {
    ((this._map = new WeakMap()), (this._idmap = new Map()));
  }
  add(t, ...n) {
    const r = n[0];
    return (
      this._map.set(t, r),
      r && typeof r == "object" && "id" in r && this._idmap.set(r.id, t),
      this
    );
  }
  clear() {
    return ((this._map = new WeakMap()), (this._idmap = new Map()), this);
  }
  remove(t) {
    const n = this._map.get(t);
    return (
      n && typeof n == "object" && "id" in n && this._idmap.delete(n.id),
      this._map.delete(t),
      this
    );
  }
  get(t) {
    const n = t._zod.parent;
    if (n) {
      const r = { ...(this.get(n) ?? {}) };
      delete r.id;
      const o = { ...r, ...this._map.get(t) };
      return Object.keys(o).length ? o : void 0;
    }
    return this._map.get(t);
  }
  has(t) {
    return this._map.has(t);
  }
}
function na() {
  return new ta();
}
(Ft = globalThis).__zod_globalRegistry ?? (Ft.__zod_globalRegistry = na());
const ie = globalThis.__zod_globalRegistry;
function ra(e, t) {
  return new e({ type: "string", ...p(t) });
}
function oa(e, t) {
  return new e({
    type: "string",
    format: "email",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function jt(e, t) {
  return new e({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function sa(e, t) {
  return new e({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function ia(e, t) {
  return new e({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: !1,
    version: "v4",
    ...p(t),
  });
}
function aa(e, t) {
  return new e({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: !1,
    version: "v6",
    ...p(t),
  });
}
function ca(e, t) {
  return new e({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: !1,
    version: "v7",
    ...p(t),
  });
}
function ua(e, t) {
  return new e({
    type: "string",
    format: "url",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function fa(e, t) {
  return new e({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function la(e, t) {
  return new e({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function da(e, t) {
  return new e({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function ha(e, t) {
  return new e({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function pa(e, t) {
  return new e({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function ma(e, t) {
  return new e({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function ga(e, t) {
  return new e({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function _a(e, t) {
  return new e({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function ya(e, t) {
  return new e({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function ba(e, t) {
  return new e({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function wa(e, t) {
  return new e({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function va(e, t) {
  return new e({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function Sa(e, t) {
  return new e({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function ka(e, t) {
  return new e({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function Oa(e, t) {
  return new e({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: !1,
    ...p(t),
  });
}
function za(e, t) {
  return new e({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: !1,
    local: !1,
    precision: null,
    ...p(t),
  });
}
function Ea(e, t) {
  return new e({
    type: "string",
    format: "date",
    check: "string_format",
    ...p(t),
  });
}
function $a(e, t) {
  return new e({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...p(t),
  });
}
function Ta(e, t) {
  return new e({
    type: "string",
    format: "duration",
    check: "string_format",
    ...p(t),
  });
}
function Da(e, t) {
  return new e({ type: "number", checks: [], ...p(t) });
}
function Pa(e, t) {
  return new e({
    type: "number",
    check: "number_format",
    abort: !1,
    format: "safeint",
    ...p(t),
  });
}
function Ma(e, t) {
  return new e({ type: "boolean", ...p(t) });
}
function Ia(e) {
  return new e({ type: "any" });
}
function Za(e) {
  return new e({ type: "unknown" });
}
function Na(e, t) {
  return new e({ type: "never", ...p(t) });
}
function Rt(e, t) {
  return new Tn({ check: "less_than", ...p(t), value: e, inclusive: !1 });
}
function Fe(e, t) {
  return new Tn({ check: "less_than", ...p(t), value: e, inclusive: !0 });
}
function Lt(e, t) {
  return new Dn({ check: "greater_than", ...p(t), value: e, inclusive: !1 });
}
function je(e, t) {
  return new Dn({ check: "greater_than", ...p(t), value: e, inclusive: !0 });
}
function Ut(e, t) {
  return new Gs({ check: "multiple_of", ...p(t), value: e });
}
function Cn(e, t) {
  return new qs({ check: "max_length", ...p(t), maximum: e });
}
function Ee(e, t) {
  return new Ks({ check: "min_length", ...p(t), minimum: e });
}
function xn(e, t) {
  return new Qs({ check: "length_equals", ...p(t), length: e });
}
function Ca(e, t) {
  return new ei({
    check: "string_format",
    format: "regex",
    ...p(t),
    pattern: e,
  });
}
function xa(e) {
  return new ti({ check: "string_format", format: "lowercase", ...p(e) });
}
function Aa(e) {
  return new ni({ check: "string_format", format: "uppercase", ...p(e) });
}
function Fa(e, t) {
  return new ri({
    check: "string_format",
    format: "includes",
    ...p(t),
    includes: e,
  });
}
function ja(e, t) {
  return new oi({
    check: "string_format",
    format: "starts_with",
    ...p(t),
    prefix: e,
  });
}
function Ra(e, t) {
  return new si({
    check: "string_format",
    format: "ends_with",
    ...p(t),
    suffix: e,
  });
}
function ne(e) {
  return new ii({ check: "overwrite", tx: e });
}
function La(e) {
  return ne((t) => t.normalize(e));
}
function Ua() {
  return ne((e) => e.trim());
}
function Ya() {
  return ne((e) => e.toLowerCase());
}
function Wa() {
  return ne((e) => e.toUpperCase());
}
function Ja() {
  return ne((e) => Qo(e));
}
function Va(e, t, n) {
  return new e({ type: "array", element: t, ...p(n) });
}
function Ha(e, t, n) {
  return new e({ type: "custom", check: "custom", fn: t, ...p(n) });
}
function Ba(e) {
  const t = Ga(
    (n) => (
      (n.addIssue = (r) => {
        if (typeof r == "string") n.issues.push(de(r, n.value, t._zod.def));
        else {
          const o = r;
          (o.fatal && (o.continue = !1),
            o.code ?? (o.code = "custom"),
            o.input ?? (o.input = n.value),
            o.inst ?? (o.inst = t),
            o.continue ?? (o.continue = !t._zod.def.abort),
            n.issues.push(de(o)));
        }
      }),
      e(n.value, n)
    ),
  );
  return t;
}
function Ga(e, t) {
  const n = new D({ check: "custom", ...p(t) });
  return ((n._zod.check = e), n);
}
function An(e) {
  let t = e?.target ?? "draft-2020-12";
  return (
    t === "draft-4" && (t = "draft-04"),
    t === "draft-7" && (t = "draft-07"),
    {
      processors: e.processors ?? {},
      metadataRegistry: e?.metadata ?? ie,
      target: t,
      unrepresentable: e?.unrepresentable ?? "throw",
      override: e?.override ?? (() => {}),
      io: e?.io ?? "output",
      counter: 0,
      seen: new Map(),
      cycles: e?.cycles ?? "ref",
      reused: e?.reused ?? "inline",
      external: e?.external ?? void 0,
    }
  );
}
function $(e, t, n = { path: [], schemaPath: [] }) {
  var r;
  const o = e._zod.def,
    i = t.seen.get(e);
  if (i)
    return (
      i.count++,
      n.schemaPath.includes(e) && (i.cycle = n.path),
      i.schema
    );
  const s = { schema: {}, count: 1, cycle: void 0, path: n.path };
  t.seen.set(e, s);
  const a = e._zod.toJSONSchema?.();
  if (a) s.schema = a;
  else {
    const l = { ...n, schemaPath: [...n.schemaPath, e], path: n.path };
    if (e._zod.processJSONSchema) e._zod.processJSONSchema(t, s.schema, l);
    else {
      const h = s.schema,
        m = t.processors[o.type];
      if (!m)
        throw new Error(
          `[toJSONSchema]: Non-representable type encountered: ${o.type}`,
        );
      m(e, t, h, l);
    }
    const d = e._zod.parent;
    d && (s.ref || (s.ref = d), $(d, t, l), (t.seen.get(d).isParent = !0));
  }
  const c = t.metadataRegistry.get(e);
  return (
    c && Object.assign(s.schema, c),
    t.io === "input" &&
      T(e) &&
      (delete s.schema.examples, delete s.schema.default),
    t.io === "input" &&
      s.schema._prefault &&
      ((r = s.schema).default ?? (r.default = s.schema._prefault)),
    delete s.schema._prefault,
    t.seen.get(e).schema
  );
}
function Fn(e, t) {
  const n = e.seen.get(t);
  if (!n) throw new Error("Unprocessed schema. This is a bug in Zod.");
  const r = new Map();
  for (const s of e.seen.entries()) {
    const a = e.metadataRegistry.get(s[0])?.id;
    if (a) {
      const c = r.get(a);
      if (c && c !== s[0])
        throw new Error(
          `Duplicate schema id "${a}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`,
        );
      r.set(a, s[0]);
    }
  }
  const o = (s) => {
      const a = e.target === "draft-2020-12" ? "$defs" : "definitions";
      if (e.external) {
        const d = e.external.registry.get(s[0])?.id,
          h = e.external.uri ?? ((b) => b);
        if (d) return { ref: h(d) };
        const m = s[1].defId ?? s[1].schema.id ?? `schema${e.counter++}`;
        return (
          (s[1].defId = m),
          { defId: m, ref: `${h("__shared")}#/${a}/${m}` }
        );
      }
      if (s[1] === n) return { ref: "#" };
      const u = `#/${a}/`,
        l = s[1].schema.id ?? `__schema${e.counter++}`;
      return { defId: l, ref: u + l };
    },
    i = (s) => {
      if (s[1].schema.$ref) return;
      const a = s[1],
        { ref: c, defId: u } = o(s);
      ((a.def = { ...a.schema }), u && (a.defId = u));
      const l = a.schema;
      for (const d in l) delete l[d];
      l.$ref = c;
    };
  if (e.cycles === "throw")
    for (const s of e.seen.entries()) {
      const a = s[1];
      if (a.cycle)
        throw new Error(`Cycle detected: #/${a.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
    }
  for (const s of e.seen.entries()) {
    const a = s[1];
    if (t === s[0]) {
      i(s);
      continue;
    }
    if (e.external) {
      const u = e.external.registry.get(s[0])?.id;
      if (t !== s[0] && u) {
        i(s);
        continue;
      }
    }
    if (e.metadataRegistry.get(s[0])?.id) {
      i(s);
      continue;
    }
    if (a.cycle) {
      i(s);
      continue;
    }
    if (a.count > 1 && e.reused === "ref") {
      i(s);
      continue;
    }
  }
}
function jn(e, t) {
  const n = e.seen.get(t);
  if (!n) throw new Error("Unprocessed schema. This is a bug in Zod.");
  const r = (s) => {
    const a = e.seen.get(s);
    if (a.ref === null) return;
    const c = a.def ?? a.schema,
      u = { ...c },
      l = a.ref;
    if (((a.ref = null), l)) {
      r(l);
      const h = e.seen.get(l),
        m = h.schema;
      if (
        (m.$ref &&
        (e.target === "draft-07" ||
          e.target === "draft-04" ||
          e.target === "openapi-3.0")
          ? ((c.allOf = c.allOf ?? []), c.allOf.push(m))
          : Object.assign(c, m),
        Object.assign(c, u),
        s._zod.parent === l)
      )
        for (const v in c)
          v === "$ref" || v === "allOf" || v in u || delete c[v];
      if (m.$ref && h.def)
        for (const v in c)
          v === "$ref" ||
            v === "allOf" ||
            (v in h.def &&
              JSON.stringify(c[v]) === JSON.stringify(h.def[v]) &&
              delete c[v]);
    }
    const d = s._zod.parent;
    if (d && d !== l) {
      r(d);
      const h = e.seen.get(d);
      if (h?.schema.$ref && ((c.$ref = h.schema.$ref), h.def))
        for (const m in c)
          m === "$ref" ||
            m === "allOf" ||
            (m in h.def &&
              JSON.stringify(c[m]) === JSON.stringify(h.def[m]) &&
              delete c[m]);
    }
    e.override({ zodSchema: s, jsonSchema: c, path: a.path ?? [] });
  };
  for (const s of [...e.seen.entries()].reverse()) r(s[0]);
  const o = {};
  if (
    (e.target === "draft-2020-12"
      ? (o.$schema = "https://json-schema.org/draft/2020-12/schema")
      : e.target === "draft-07"
        ? (o.$schema = "http://json-schema.org/draft-07/schema#")
        : e.target === "draft-04"
          ? (o.$schema = "http://json-schema.org/draft-04/schema#")
          : e.target,
    e.external?.uri)
  ) {
    const s = e.external.registry.get(t)?.id;
    if (!s) throw new Error("Schema is missing an `id` property");
    o.$id = e.external.uri(s);
  }
  Object.assign(o, n.def ?? n.schema);
  const i = e.external?.defs ?? {};
  for (const s of e.seen.entries()) {
    const a = s[1];
    a.def && a.defId && (i[a.defId] = a.def);
  }
  e.external ||
    (Object.keys(i).length > 0 &&
      (e.target === "draft-2020-12" ? (o.$defs = i) : (o.definitions = i)));
  try {
    const s = JSON.parse(JSON.stringify(o));
    return (
      Object.defineProperty(s, "~standard", {
        value: {
          ...t["~standard"],
          jsonSchema: {
            input: $e(t, "input", e.processors),
            output: $e(t, "output", e.processors),
          },
        },
        enumerable: !1,
        writable: !1,
      }),
      s
    );
  } catch {
    throw new Error("Error converting schema to JSON.");
  }
}
function T(e, t) {
  const n = t ?? { seen: new Set() };
  if (n.seen.has(e)) return !1;
  n.seen.add(e);
  const r = e._zod.def;
  if (r.type === "transform") return !0;
  if (r.type === "array") return T(r.element, n);
  if (r.type === "set") return T(r.valueType, n);
  if (r.type === "lazy") return T(r.getter(), n);
  if (
    r.type === "promise" ||
    r.type === "optional" ||
    r.type === "nonoptional" ||
    r.type === "nullable" ||
    r.type === "readonly" ||
    r.type === "default" ||
    r.type === "prefault"
  )
    return T(r.innerType, n);
  if (r.type === "intersection") return T(r.left, n) || T(r.right, n);
  if (r.type === "record" || r.type === "map")
    return T(r.keyType, n) || T(r.valueType, n);
  if (r.type === "pipe") return T(r.in, n) || T(r.out, n);
  if (r.type === "object") {
    for (const o in r.shape) if (T(r.shape[o], n)) return !0;
    return !1;
  }
  if (r.type === "union") {
    for (const o of r.options) if (T(o, n)) return !0;
    return !1;
  }
  if (r.type === "tuple") {
    for (const o of r.items) if (T(o, n)) return !0;
    return !!(r.rest && T(r.rest, n));
  }
  return !1;
}
const Xa =
    (e, t = {}) =>
    (n) => {
      const r = An({ ...n, processors: t });
      return ($(e, r), Fn(r, e), jn(r, e));
    },
  $e =
    (e, t, n = {}) =>
    (r) => {
      const { libraryOptions: o, target: i } = r ?? {},
        s = An({ ...(o ?? {}), target: i, io: t, processors: n });
      return ($(e, s), Fn(s, e), jn(s, e));
    },
  qa = {
    guid: "uuid",
    url: "uri",
    datetime: "date-time",
    json_string: "json-string",
    regex: "",
  },
  Ka = (e, t, n, r) => {
    const o = n;
    o.type = "string";
    const {
      minimum: i,
      maximum: s,
      format: a,
      patterns: c,
      contentEncoding: u,
    } = e._zod.bag;
    if (
      (typeof i == "number" && (o.minLength = i),
      typeof s == "number" && (o.maxLength = s),
      a &&
        ((o.format = qa[a] ?? a),
        o.format === "" && delete o.format,
        a === "time" && delete o.format),
      u && (o.contentEncoding = u),
      c && c.size > 0)
    ) {
      const l = [...c];
      l.length === 1
        ? (o.pattern = l[0].source)
        : l.length > 1 &&
          (o.allOf = [
            ...l.map((d) => ({
              ...(t.target === "draft-07" ||
              t.target === "draft-04" ||
              t.target === "openapi-3.0"
                ? { type: "string" }
                : {}),
              pattern: d.source,
            })),
          ]);
    }
  },
  Qa = (e, t, n, r) => {
    const o = n,
      {
        minimum: i,
        maximum: s,
        format: a,
        multipleOf: c,
        exclusiveMaximum: u,
        exclusiveMinimum: l,
      } = e._zod.bag;
    (typeof a == "string" && a.includes("int")
      ? (o.type = "integer")
      : (o.type = "number"),
      typeof l == "number" &&
        (t.target === "draft-04" || t.target === "openapi-3.0"
          ? ((o.minimum = l), (o.exclusiveMinimum = !0))
          : (o.exclusiveMinimum = l)),
      typeof i == "number" &&
        ((o.minimum = i),
        typeof l == "number" &&
          t.target !== "draft-04" &&
          (l >= i ? delete o.minimum : delete o.exclusiveMinimum)),
      typeof u == "number" &&
        (t.target === "draft-04" || t.target === "openapi-3.0"
          ? ((o.maximum = u), (o.exclusiveMaximum = !0))
          : (o.exclusiveMaximum = u)),
      typeof s == "number" &&
        ((o.maximum = s),
        typeof u == "number" &&
          t.target !== "draft-04" &&
          (u <= s ? delete o.maximum : delete o.exclusiveMaximum)),
      typeof c == "number" && (o.multipleOf = c));
  },
  ec = (e, t, n, r) => {
    n.type = "boolean";
  },
  tc = (e, t, n, r) => {
    n.not = {};
  },
  nc = (e, t, n, r) => {},
  rc = (e, t, n, r) => {},
  oc = (e, t, n, r) => {
    const o = e._zod.def,
      i = _n(o.entries);
    (i.every((s) => typeof s == "number") && (n.type = "number"),
      i.every((s) => typeof s == "string") && (n.type = "string"),
      (n.enum = i));
  },
  sc = (e, t, n, r) => {
    if (t.unrepresentable === "throw")
      throw new Error("Custom types cannot be represented in JSON Schema");
  },
  ic = (e, t, n, r) => {
    if (t.unrepresentable === "throw")
      throw new Error("Transforms cannot be represented in JSON Schema");
  },
  ac = (e, t, n, r) => {
    const o = n,
      i = e._zod.def,
      { minimum: s, maximum: a } = e._zod.bag;
    (typeof s == "number" && (o.minItems = s),
      typeof a == "number" && (o.maxItems = a),
      (o.type = "array"),
      (o.items = $(i.element, t, { ...r, path: [...r.path, "items"] })));
  },
  cc = (e, t, n, r) => {
    const o = n,
      i = e._zod.def;
    ((o.type = "object"), (o.properties = {}));
    const s = i.shape;
    for (const u in s)
      o.properties[u] = $(s[u], t, {
        ...r,
        path: [...r.path, "properties", u],
      });
    const a = new Set(Object.keys(s)),
      c = new Set(
        [...a].filter((u) => {
          const l = i.shape[u]._zod;
          return t.io === "input" ? l.optin === void 0 : l.optout === void 0;
        }),
      );
    (c.size > 0 && (o.required = Array.from(c)),
      i.catchall?._zod.def.type === "never"
        ? (o.additionalProperties = !1)
        : i.catchall
          ? i.catchall &&
            (o.additionalProperties = $(i.catchall, t, {
              ...r,
              path: [...r.path, "additionalProperties"],
            }))
          : t.io === "output" && (o.additionalProperties = !1));
  },
  uc = (e, t, n, r) => {
    const o = e._zod.def,
      i = o.inclusive === !1,
      s = o.options.map((a, c) =>
        $(a, t, { ...r, path: [...r.path, i ? "oneOf" : "anyOf", c] }),
      );
    i ? (n.oneOf = s) : (n.anyOf = s);
  },
  fc = (e, t, n, r) => {
    const o = e._zod.def,
      i = $(o.left, t, { ...r, path: [...r.path, "allOf", 0] }),
      s = $(o.right, t, { ...r, path: [...r.path, "allOf", 1] }),
      a = (u) => "allOf" in u && Object.keys(u).length === 1,
      c = [...(a(i) ? i.allOf : [i]), ...(a(s) ? s.allOf : [s])];
    n.allOf = c;
  },
  lc = (e, t, n, r) => {
    const o = e._zod.def,
      i = $(o.innerType, t, r),
      s = t.seen.get(e);
    t.target === "openapi-3.0"
      ? ((s.ref = o.innerType), (n.nullable = !0))
      : (n.anyOf = [i, { type: "null" }]);
  },
  dc = (e, t, n, r) => {
    const o = e._zod.def;
    $(o.innerType, t, r);
    const i = t.seen.get(e);
    i.ref = o.innerType;
  },
  hc = (e, t, n, r) => {
    const o = e._zod.def;
    $(o.innerType, t, r);
    const i = t.seen.get(e);
    ((i.ref = o.innerType),
      (n.default = JSON.parse(JSON.stringify(o.defaultValue))));
  },
  pc = (e, t, n, r) => {
    const o = e._zod.def;
    $(o.innerType, t, r);
    const i = t.seen.get(e);
    ((i.ref = o.innerType),
      t.io === "input" &&
        (n._prefault = JSON.parse(JSON.stringify(o.defaultValue))));
  },
  mc = (e, t, n, r) => {
    const o = e._zod.def;
    $(o.innerType, t, r);
    const i = t.seen.get(e);
    i.ref = o.innerType;
    let s;
    try {
      s = o.catchValue(void 0);
    } catch {
      throw new Error("Dynamic catch values are not supported in JSON Schema");
    }
    n.default = s;
  },
  gc = (e, t, n, r) => {
    const o = e._zod.def,
      i =
        t.io === "input"
          ? o.in._zod.def.type === "transform"
            ? o.out
            : o.in
          : o.out;
    $(i, t, r);
    const s = t.seen.get(e);
    s.ref = i;
  },
  _c = (e, t, n, r) => {
    const o = e._zod.def;
    $(o.innerType, t, r);
    const i = t.seen.get(e);
    ((i.ref = o.innerType), (n.readOnly = !0));
  },
  Rn = (e, t, n, r) => {
    const o = e._zod.def;
    $(o.innerType, t, r);
    const i = t.seen.get(e);
    i.ref = o.innerType;
  },
  yc = f("ZodISODateTime", (e, t) => {
    (wi.init(e, t), S.init(e, t));
  });
function bc(e) {
  return za(yc, e);
}
const wc = f("ZodISODate", (e, t) => {
  (vi.init(e, t), S.init(e, t));
});
function vc(e) {
  return Ea(wc, e);
}
const Sc = f("ZodISOTime", (e, t) => {
  (Si.init(e, t), S.init(e, t));
});
function kc(e) {
  return $a(Sc, e);
}
const Oc = f("ZodISODuration", (e, t) => {
  (ki.init(e, t), S.init(e, t));
});
function zc(e) {
  return Ta(Oc, e);
}
const Ec = (e, t) => {
    (Sn.init(e, t),
      (e.name = "ZodError"),
      Object.defineProperties(e, {
        format: { value: (n) => ds(e, n) },
        flatten: { value: (n) => ls(e, n) },
        addIssue: {
          value: (n) => {
            (e.issues.push(n), (e.message = JSON.stringify(e.issues, Ye, 2)));
          },
        },
        addIssues: {
          value: (n) => {
            (e.issues.push(...n),
              (e.message = JSON.stringify(e.issues, Ye, 2)));
          },
        },
        isEmpty: {
          get() {
            return e.issues.length === 0;
          },
        },
      }));
  },
  M = f("ZodError", Ec, { Parent: Error }),
  $c = it(M),
  Tc = at(M),
  Dc = Ie(M),
  Pc = Ze(M),
  Mc = ms(M),
  Ic = gs(M),
  Zc = _s(M),
  Nc = ys(M),
  Cc = bs(M),
  xc = ws(M),
  Ac = vs(M),
  Fc = Ss(M),
  z = f(
    "ZodType",
    (e, t) => (
      O.init(e, t),
      Object.assign(e["~standard"], {
        jsonSchema: { input: $e(e, "input"), output: $e(e, "output") },
      }),
      (e.toJSONSchema = Xa(e, {})),
      (e.def = t),
      (e.type = t.type),
      Object.defineProperty(e, "_def", { value: t }),
      (e.check = (...n) =>
        e.clone(
          j(t, {
            checks: [
              ...(t.checks ?? []),
              ...n.map((r) =>
                typeof r == "function"
                  ? {
                      _zod: {
                        check: r,
                        def: { check: "custom" },
                        onattach: [],
                      },
                    }
                  : r,
              ),
            ],
          }),
          { parent: !0 },
        )),
      (e.with = e.check),
      (e.clone = (n, r) => R(e, n, r)),
      (e.brand = () => e),
      (e.register = (n, r) => (n.add(e, r), e)),
      (e.parse = (n, r) => $c(e, n, r, { callee: e.parse })),
      (e.safeParse = (n, r) => Dc(e, n, r)),
      (e.parseAsync = async (n, r) => Tc(e, n, r, { callee: e.parseAsync })),
      (e.safeParseAsync = async (n, r) => Pc(e, n, r)),
      (e.spa = e.safeParseAsync),
      (e.encode = (n, r) => Mc(e, n, r)),
      (e.decode = (n, r) => Ic(e, n, r)),
      (e.encodeAsync = async (n, r) => Zc(e, n, r)),
      (e.decodeAsync = async (n, r) => Nc(e, n, r)),
      (e.safeEncode = (n, r) => Cc(e, n, r)),
      (e.safeDecode = (n, r) => xc(e, n, r)),
      (e.safeEncodeAsync = async (n, r) => Ac(e, n, r)),
      (e.safeDecodeAsync = async (n, r) => Fc(e, n, r)),
      (e.refine = (n, r) => e.check(Zu(n, r))),
      (e.superRefine = (n) => e.check(Nu(n))),
      (e.overwrite = (n) => e.check(ne(n))),
      (e.optional = () => Vt(e)),
      (e.exactOptional = () => wu(e)),
      (e.nullable = () => Ht(e)),
      (e.nullish = () => Vt(Ht(e))),
      (e.nonoptional = (n) => Eu(e, n)),
      (e.array = () => fu(e)),
      (e.or = (n) => hu([e, n])),
      (e.and = (n) => mu(e, n)),
      (e.transform = (n) => Bt(e, yu(n))),
      (e.default = (n) => ku(e, n)),
      (e.prefault = (n) => zu(e, n)),
      (e.catch = (n) => Tu(e, n)),
      (e.pipe = (n) => Bt(e, n)),
      (e.readonly = () => Mu(e)),
      (e.describe = (n) => {
        const r = e.clone();
        return (ie.add(r, { description: n }), r);
      }),
      Object.defineProperty(e, "description", {
        get() {
          return ie.get(e)?.description;
        },
        configurable: !0,
      }),
      (e.meta = (...n) => {
        if (n.length === 0) return ie.get(e);
        const r = e.clone();
        return (ie.add(r, n[0]), r);
      }),
      (e.isOptional = () => e.safeParse(void 0).success),
      (e.isNullable = () => e.safeParse(null).success),
      (e.apply = (n) => n(e)),
      e
    ),
  ),
  Ln = f("_ZodString", (e, t) => {
    (ct.init(e, t),
      z.init(e, t),
      (e._zod.processJSONSchema = (r, o, i) => Ka(e, r, o)));
    const n = e._zod.bag;
    ((e.format = n.format ?? null),
      (e.minLength = n.minimum ?? null),
      (e.maxLength = n.maximum ?? null),
      (e.regex = (...r) => e.check(Ca(...r))),
      (e.includes = (...r) => e.check(Fa(...r))),
      (e.startsWith = (...r) => e.check(ja(...r))),
      (e.endsWith = (...r) => e.check(Ra(...r))),
      (e.min = (...r) => e.check(Ee(...r))),
      (e.max = (...r) => e.check(Cn(...r))),
      (e.length = (...r) => e.check(xn(...r))),
      (e.nonempty = (...r) => e.check(Ee(1, ...r))),
      (e.lowercase = (r) => e.check(xa(r))),
      (e.uppercase = (r) => e.check(Aa(r))),
      (e.trim = () => e.check(Ua())),
      (e.normalize = (...r) => e.check(La(...r))),
      (e.toLowerCase = () => e.check(Ya())),
      (e.toUpperCase = () => e.check(Wa())),
      (e.slugify = () => e.check(Ja())));
  }),
  jc = f("ZodString", (e, t) => {
    (ct.init(e, t),
      Ln.init(e, t),
      (e.email = (n) => e.check(oa(Rc, n))),
      (e.url = (n) => e.check(ua(Lc, n))),
      (e.jwt = (n) => e.check(Oa(nu, n))),
      (e.emoji = (n) => e.check(fa(Uc, n))),
      (e.guid = (n) => e.check(jt(Yt, n))),
      (e.uuid = (n) => e.check(sa(be, n))),
      (e.uuidv4 = (n) => e.check(ia(be, n))),
      (e.uuidv6 = (n) => e.check(aa(be, n))),
      (e.uuidv7 = (n) => e.check(ca(be, n))),
      (e.nanoid = (n) => e.check(la(Yc, n))),
      (e.guid = (n) => e.check(jt(Yt, n))),
      (e.cuid = (n) => e.check(da(Wc, n))),
      (e.cuid2 = (n) => e.check(ha(Jc, n))),
      (e.ulid = (n) => e.check(pa(Vc, n))),
      (e.base64 = (n) => e.check(va(Qc, n))),
      (e.base64url = (n) => e.check(Sa(eu, n))),
      (e.xid = (n) => e.check(ma(Hc, n))),
      (e.ksuid = (n) => e.check(ga(Bc, n))),
      (e.ipv4 = (n) => e.check(_a(Gc, n))),
      (e.ipv6 = (n) => e.check(ya(Xc, n))),
      (e.cidrv4 = (n) => e.check(ba(qc, n))),
      (e.cidrv6 = (n) => e.check(wa(Kc, n))),
      (e.e164 = (n) => e.check(ka(tu, n))),
      (e.datetime = (n) => e.check(bc(n))),
      (e.date = (n) => e.check(vc(n))),
      (e.time = (n) => e.check(kc(n))),
      (e.duration = (n) => e.check(zc(n))));
  });
function Bf(e) {
  return ra(jc, e);
}
const S = f("ZodStringFormat", (e, t) => {
    (w.init(e, t), Ln.init(e, t));
  }),
  Rc = f("ZodEmail", (e, t) => {
    (li.init(e, t), S.init(e, t));
  }),
  Yt = f("ZodGUID", (e, t) => {
    (ui.init(e, t), S.init(e, t));
  }),
  be = f("ZodUUID", (e, t) => {
    (fi.init(e, t), S.init(e, t));
  }),
  Lc = f("ZodURL", (e, t) => {
    (di.init(e, t), S.init(e, t));
  }),
  Uc = f("ZodEmoji", (e, t) => {
    (hi.init(e, t), S.init(e, t));
  }),
  Yc = f("ZodNanoID", (e, t) => {
    (pi.init(e, t), S.init(e, t));
  }),
  Wc = f("ZodCUID", (e, t) => {
    (mi.init(e, t), S.init(e, t));
  }),
  Jc = f("ZodCUID2", (e, t) => {
    (gi.init(e, t), S.init(e, t));
  }),
  Vc = f("ZodULID", (e, t) => {
    (_i.init(e, t), S.init(e, t));
  }),
  Hc = f("ZodXID", (e, t) => {
    (yi.init(e, t), S.init(e, t));
  }),
  Bc = f("ZodKSUID", (e, t) => {
    (bi.init(e, t), S.init(e, t));
  }),
  Gc = f("ZodIPv4", (e, t) => {
    (Oi.init(e, t), S.init(e, t));
  }),
  Xc = f("ZodIPv6", (e, t) => {
    (zi.init(e, t), S.init(e, t));
  }),
  qc = f("ZodCIDRv4", (e, t) => {
    (Ei.init(e, t), S.init(e, t));
  }),
  Kc = f("ZodCIDRv6", (e, t) => {
    ($i.init(e, t), S.init(e, t));
  }),
  Qc = f("ZodBase64", (e, t) => {
    (Ti.init(e, t), S.init(e, t));
  }),
  eu = f("ZodBase64URL", (e, t) => {
    (Pi.init(e, t), S.init(e, t));
  }),
  tu = f("ZodE164", (e, t) => {
    (Mi.init(e, t), S.init(e, t));
  }),
  nu = f("ZodJWT", (e, t) => {
    (Zi.init(e, t), S.init(e, t));
  }),
  Un = f("ZodNumber", (e, t) => {
    (Mn.init(e, t),
      z.init(e, t),
      (e._zod.processJSONSchema = (r, o, i) => Qa(e, r, o)),
      (e.gt = (r, o) => e.check(Lt(r, o))),
      (e.gte = (r, o) => e.check(je(r, o))),
      (e.min = (r, o) => e.check(je(r, o))),
      (e.lt = (r, o) => e.check(Rt(r, o))),
      (e.lte = (r, o) => e.check(Fe(r, o))),
      (e.max = (r, o) => e.check(Fe(r, o))),
      (e.int = (r) => e.check(Wt(r))),
      (e.safe = (r) => e.check(Wt(r))),
      (e.positive = (r) => e.check(Lt(0, r))),
      (e.nonnegative = (r) => e.check(je(0, r))),
      (e.negative = (r) => e.check(Rt(0, r))),
      (e.nonpositive = (r) => e.check(Fe(0, r))),
      (e.multipleOf = (r, o) => e.check(Ut(r, o))),
      (e.step = (r, o) => e.check(Ut(r, o))),
      (e.finite = () => e));
    const n = e._zod.bag;
    ((e.minValue =
      Math.max(
        n.minimum ?? Number.NEGATIVE_INFINITY,
        n.exclusiveMinimum ?? Number.NEGATIVE_INFINITY,
      ) ?? null),
      (e.maxValue =
        Math.min(
          n.maximum ?? Number.POSITIVE_INFINITY,
          n.exclusiveMaximum ?? Number.POSITIVE_INFINITY,
        ) ?? null),
      (e.isInt =
        (n.format ?? "").includes("int") ||
        Number.isSafeInteger(n.multipleOf ?? 0.5)),
      (e.isFinite = !0),
      (e.format = n.format ?? null));
  });
function Gf(e) {
  return Da(Un, e);
}
const ru = f("ZodNumberFormat", (e, t) => {
  (Ni.init(e, t), Un.init(e, t));
});
function Wt(e) {
  return Pa(ru, e);
}
const ou = f("ZodBoolean", (e, t) => {
  (Ci.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => ec(e, n, r)));
});
function Xf(e) {
  return Ma(ou, e);
}
const su = f("ZodAny", (e, t) => {
  (xi.init(e, t), z.init(e, t), (e._zod.processJSONSchema = (n, r, o) => nc()));
});
function qf() {
  return Ia(su);
}
const iu = f("ZodUnknown", (e, t) => {
  (Ai.init(e, t), z.init(e, t), (e._zod.processJSONSchema = (n, r, o) => rc()));
});
function Jt() {
  return Za(iu);
}
const au = f("ZodNever", (e, t) => {
  (Fi.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => tc(e, n, r)));
});
function cu(e) {
  return Na(au, e);
}
const uu = f("ZodArray", (e, t) => {
  (ji.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => ac(e, n, r, o)),
    (e.element = t.element),
    (e.min = (n, r) => e.check(Ee(n, r))),
    (e.nonempty = (n) => e.check(Ee(1, n))),
    (e.max = (n, r) => e.check(Cn(n, r))),
    (e.length = (n, r) => e.check(xn(n, r))),
    (e.unwrap = () => e.element));
});
function fu(e, t) {
  return Va(uu, e, t);
}
const lu = f("ZodObject", (e, t) => {
  (Li.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => cc(e, n, r, o)),
    y(e, "shape", () => t.shape),
    (e.keyof = () => gu(Object.keys(e._zod.def.shape))),
    (e.catchall = (n) => e.clone({ ...e._zod.def, catchall: n })),
    (e.passthrough = () => e.clone({ ...e._zod.def, catchall: Jt() })),
    (e.loose = () => e.clone({ ...e._zod.def, catchall: Jt() })),
    (e.strict = () => e.clone({ ...e._zod.def, catchall: cu() })),
    (e.strip = () => e.clone({ ...e._zod.def, catchall: void 0 })),
    (e.extend = (n) => is(e, n)),
    (e.safeExtend = (n) => as(e, n)),
    (e.merge = (n) => cs(e, n)),
    (e.pick = (n) => os(e, n)),
    (e.omit = (n) => ss(e, n)),
    (e.partial = (...n) => us(Yn, e, n[0])),
    (e.required = (...n) => fs(Wn, e, n[0])));
});
function Kf(e, t) {
  const n = { type: "object", shape: e ?? {}, ...p(t) };
  return new lu(n);
}
const du = f("ZodUnion", (e, t) => {
  (Ui.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => uc(e, n, r, o)),
    (e.options = t.options));
});
function hu(e, t) {
  return new du({ type: "union", options: e, ...p(t) });
}
const pu = f("ZodIntersection", (e, t) => {
  (Yi.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => fc(e, n, r, o)));
});
function mu(e, t) {
  return new pu({ type: "intersection", left: e, right: t });
}
const Je = f("ZodEnum", (e, t) => {
  (Wi.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (r, o, i) => oc(e, r, o)),
    (e.enum = t.entries),
    (e.options = Object.values(t.entries)));
  const n = new Set(Object.keys(t.entries));
  ((e.extract = (r, o) => {
    const i = {};
    for (const s of r)
      if (n.has(s)) i[s] = t.entries[s];
      else throw new Error(`Key ${s} not found in enum`);
    return new Je({ ...t, checks: [], ...p(o), entries: i });
  }),
    (e.exclude = (r, o) => {
      const i = { ...t.entries };
      for (const s of r)
        if (n.has(s)) delete i[s];
        else throw new Error(`Key ${s} not found in enum`);
      return new Je({ ...t, checks: [], ...p(o), entries: i });
    }));
});
function gu(e, t) {
  const n = Array.isArray(e) ? Object.fromEntries(e.map((r) => [r, r])) : e;
  return new Je({ type: "enum", entries: n, ...p(t) });
}
const _u = f("ZodTransform", (e, t) => {
  (Ji.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => ic(e, n)),
    (e._zod.parse = (n, r) => {
      if (r.direction === "backward") throw new mn(e.constructor.name);
      n.addIssue = (i) => {
        if (typeof i == "string") n.issues.push(de(i, n.value, t));
        else {
          const s = i;
          (s.fatal && (s.continue = !1),
            s.code ?? (s.code = "custom"),
            s.input ?? (s.input = n.value),
            s.inst ?? (s.inst = e),
            n.issues.push(de(s)));
        }
      };
      const o = t.transform(n.value, n);
      return o instanceof Promise
        ? o.then((i) => ((n.value = i), n))
        : ((n.value = o), n);
    }));
});
function yu(e) {
  return new _u({ type: "transform", transform: e });
}
const Yn = f("ZodOptional", (e, t) => {
  (Nn.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => Rn(e, n, r, o)),
    (e.unwrap = () => e._zod.def.innerType));
});
function Vt(e) {
  return new Yn({ type: "optional", innerType: e });
}
const bu = f("ZodExactOptional", (e, t) => {
  (Vi.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => Rn(e, n, r, o)),
    (e.unwrap = () => e._zod.def.innerType));
});
function wu(e) {
  return new bu({ type: "optional", innerType: e });
}
const vu = f("ZodNullable", (e, t) => {
  (Hi.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => lc(e, n, r, o)),
    (e.unwrap = () => e._zod.def.innerType));
});
function Ht(e) {
  return new vu({ type: "nullable", innerType: e });
}
const Su = f("ZodDefault", (e, t) => {
  (Bi.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => hc(e, n, r, o)),
    (e.unwrap = () => e._zod.def.innerType),
    (e.removeDefault = e.unwrap));
});
function ku(e, t) {
  return new Su({
    type: "default",
    innerType: e,
    get defaultValue() {
      return typeof t == "function" ? t() : bn(t);
    },
  });
}
const Ou = f("ZodPrefault", (e, t) => {
  (Gi.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => pc(e, n, r, o)),
    (e.unwrap = () => e._zod.def.innerType));
});
function zu(e, t) {
  return new Ou({
    type: "prefault",
    innerType: e,
    get defaultValue() {
      return typeof t == "function" ? t() : bn(t);
    },
  });
}
const Wn = f("ZodNonOptional", (e, t) => {
  (Xi.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => dc(e, n, r, o)),
    (e.unwrap = () => e._zod.def.innerType));
});
function Eu(e, t) {
  return new Wn({ type: "nonoptional", innerType: e, ...p(t) });
}
const $u = f("ZodCatch", (e, t) => {
  (qi.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => mc(e, n, r, o)),
    (e.unwrap = () => e._zod.def.innerType),
    (e.removeCatch = e.unwrap));
});
function Tu(e, t) {
  return new $u({
    type: "catch",
    innerType: e,
    catchValue: typeof t == "function" ? t : () => t,
  });
}
const Du = f("ZodPipe", (e, t) => {
  (Ki.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => gc(e, n, r, o)),
    (e.in = t.in),
    (e.out = t.out));
});
function Bt(e, t) {
  return new Du({ type: "pipe", in: e, out: t });
}
const Pu = f("ZodReadonly", (e, t) => {
  (Qi.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => _c(e, n, r, o)),
    (e.unwrap = () => e._zod.def.innerType));
});
function Mu(e) {
  return new Pu({ type: "readonly", innerType: e });
}
const Iu = f("ZodCustom", (e, t) => {
  (ea.init(e, t),
    z.init(e, t),
    (e._zod.processJSONSchema = (n, r, o) => sc(e, n)));
});
function Zu(e, t = {}) {
  return Ha(Iu, e, t);
}
function Nu(e) {
  return Ba(e);
}
function Cu(e, t, n = "long") {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    timeZone: e,
    timeZoneName: n,
  })
    .format(t)
    .split(/\s/g)
    .slice(2)
    .join(" ");
}
const xu = {},
  ae = {};
function U(e, t) {
  try {
    const r = (xu[e] ||= new Intl.DateTimeFormat("en-US", {
      timeZone: e,
      timeZoneName: "longOffset",
    }).format)(t).split("GMT")[1];
    return r in ae ? ae[r] : Gt(r, r.split(":"));
  } catch {
    if (e in ae) return ae[e];
    const n = e?.match(Au);
    return n ? Gt(e, n.slice(1)) : NaN;
  }
}
const Au = /([+-]\d\d):?(\d\d)?/;
function Gt(e, t) {
  const n = +(t[0] || 0),
    r = +(t[1] || 0),
    o = +(t[2] || 0) / 60;
  return (ae[e] = n * 60 + r > 0 ? n * 60 + r + o : n * 60 - r - o);
}
class Z extends Date {
  constructor(...t) {
    (super(),
      t.length > 1 &&
        typeof t[t.length - 1] == "string" &&
        (this.timeZone = t.pop()),
      (this.internal = new Date()),
      isNaN(U(this.timeZone, this))
        ? this.setTime(NaN)
        : t.length
          ? typeof t[0] == "number" &&
            (t.length === 1 || (t.length === 2 && typeof t[1] != "number"))
            ? this.setTime(t[0])
            : typeof t[0] == "string"
              ? this.setTime(+new Date(t[0]))
              : t[0] instanceof Date
                ? this.setTime(+t[0])
                : (this.setTime(+new Date(...t)), Jn(this), Ve(this))
          : this.setTime(Date.now()));
  }
  static tz(t, ...n) {
    return n.length ? new Z(...n, t) : new Z(Date.now(), t);
  }
  withTimeZone(t) {
    return new Z(+this, t);
  }
  getTimezoneOffset() {
    const t = -U(this.timeZone, this);
    return t > 0 ? Math.floor(t) : Math.ceil(t);
  }
  setTime(t) {
    return (Date.prototype.setTime.apply(this, arguments), Ve(this), +this);
  }
  [Symbol.for("constructDateFrom")](t) {
    return new Z(+new Date(t), this.timeZone);
  }
}
const Xt = /^(get|set)(?!UTC)/;
Object.getOwnPropertyNames(Date.prototype).forEach((e) => {
  if (!Xt.test(e)) return;
  const t = e.replace(Xt, "$1UTC");
  Z.prototype[t] &&
    (e.startsWith("get")
      ? (Z.prototype[e] = function () {
          return this.internal[t]();
        })
      : ((Z.prototype[e] = function () {
          return (
            Date.prototype[t].apply(this.internal, arguments),
            Fu(this),
            +this
          );
        }),
        (Z.prototype[t] = function () {
          return (Date.prototype[t].apply(this, arguments), Ve(this), +this);
        })));
});
function Ve(e) {
  (e.internal.setTime(+e),
    e.internal.setUTCSeconds(
      e.internal.getUTCSeconds() - Math.round(-U(e.timeZone, e) * 60),
    ));
}
function Fu(e) {
  (Date.prototype.setFullYear.call(
    e,
    e.internal.getUTCFullYear(),
    e.internal.getUTCMonth(),
    e.internal.getUTCDate(),
  ),
    Date.prototype.setHours.call(
      e,
      e.internal.getUTCHours(),
      e.internal.getUTCMinutes(),
      e.internal.getUTCSeconds(),
      e.internal.getUTCMilliseconds(),
    ),
    Jn(e));
}
function Jn(e) {
  const t = U(e.timeZone, e),
    n = t > 0 ? Math.floor(t) : Math.ceil(t),
    r = new Date(+e);
  r.setUTCHours(r.getUTCHours() - 1);
  const o = -new Date(+e).getTimezoneOffset(),
    i = -new Date(+r).getTimezoneOffset(),
    s = o - i,
    a = Date.prototype.getHours.apply(e) !== e.internal.getUTCHours();
  s && a && e.internal.setUTCMinutes(e.internal.getUTCMinutes() + s);
  const c = o - n;
  c &&
    Date.prototype.setUTCMinutes.call(
      e,
      Date.prototype.getUTCMinutes.call(e) + c,
    );
  const u = new Date(+e);
  u.setUTCSeconds(0);
  const l = o > 0 ? u.getSeconds() : (u.getSeconds() - 60) % 60,
    d = Math.round(-(U(e.timeZone, e) * 60)) % 60;
  (d || l) &&
    (e.internal.setUTCSeconds(e.internal.getUTCSeconds() + d),
    Date.prototype.setUTCSeconds.call(
      e,
      Date.prototype.getUTCSeconds.call(e) + d + l,
    ));
  const h = U(e.timeZone, e),
    m = h > 0 ? Math.floor(h) : Math.ceil(h),
    v = -new Date(+e).getTimezoneOffset() - m,
    B = m !== n,
    pe = v - c;
  if (B && pe) {
    Date.prototype.setUTCMinutes.call(
      e,
      Date.prototype.getUTCMinutes.call(e) + pe,
    );
    const re = U(e.timeZone, e),
      P = re > 0 ? Math.floor(re) : Math.ceil(re),
      E = m - P;
    E &&
      (e.internal.setUTCMinutes(e.internal.getUTCMinutes() + E),
      Date.prototype.setUTCMinutes.call(
        e,
        Date.prototype.getUTCMinutes.call(e) + E,
      ));
  }
}
class ce extends Z {
  static tz(t, ...n) {
    return n.length ? new ce(...n, t) : new ce(Date.now(), t);
  }
  toISOString() {
    const [t, n, r] = this.tzComponents(),
      o = `${t}${n}:${r}`;
    return this.internal.toISOString().slice(0, -1) + o;
  }
  toString() {
    return `${this.toDateString()} ${this.toTimeString()}`;
  }
  toDateString() {
    const [t, n, r, o] = this.internal.toUTCString().split(" ");
    return `${t?.slice(0, -1)} ${r} ${n} ${o}`;
  }
  toTimeString() {
    const t = this.internal.toUTCString().split(" ")[4],
      [n, r, o] = this.tzComponents();
    return `${t} GMT${n}${r}${o} (${Cu(this.timeZone, this)})`;
  }
  toLocaleString(t, n) {
    return Date.prototype.toLocaleString.call(this, t, {
      ...n,
      timeZone: n?.timeZone || this.timeZone,
    });
  }
  toLocaleDateString(t, n) {
    return Date.prototype.toLocaleDateString.call(this, t, {
      ...n,
      timeZone: n?.timeZone || this.timeZone,
    });
  }
  toLocaleTimeString(t, n) {
    return Date.prototype.toLocaleTimeString.call(this, t, {
      ...n,
      timeZone: n?.timeZone || this.timeZone,
    });
  }
  tzComponents() {
    const t = this.getTimezoneOffset(),
      n = t > 0 ? "-" : "+",
      r = String(Math.floor(Math.abs(t) / 60)).padStart(2, "0"),
      o = String(Math.abs(t) % 60).padStart(2, "0");
    return [n, r, o];
  }
  withTimeZone(t) {
    return new ce(+this, t);
  }
  [Symbol.for("constructDateFrom")](t) {
    return new ce(+new Date(t), this.timeZone);
  }
}
export {
  df as $,
  gr as A,
  af as B,
  Nr as C,
  x as D,
  _f as E,
  gf as F,
  N as G,
  pf as H,
  Le as I,
  sr as J,
  Hu as K,
  en as L,
  or as M,
  ue as N,
  yf as O,
  Qu as P,
  rf as Q,
  nf as R,
  F as S,
  he as T,
  Ru as U,
  Ku as V,
  ut as W,
  Yu as X,
  qe as Y,
  Gu as Z,
  pr as _,
  Or as a,
  Lf as a$,
  Xu as a0,
  of as a1,
  Wu as a2,
  Ju as a3,
  Vu as a4,
  ir as a5,
  ef as a6,
  tr as a7,
  er as a8,
  dr as a9,
  kf as aA,
  Yf as aB,
  Wf as aC,
  vf as aD,
  Sf as aE,
  Jf as aF,
  Vf as aG,
  ke as aH,
  ve as aI,
  Pf as aJ,
  fe as aK,
  Xr as aL,
  xf as aM,
  Kf as aN,
  qf as aO,
  fu as aP,
  Bf as aQ,
  Gf as aR,
  gu as aS,
  Xf as aT,
  Hf as aU,
  Nf as aV,
  Df as aW,
  Of as aX,
  zf as aY,
  Ef as aZ,
  Gr as a_,
  qu as aa,
  tf as ab,
  mf as ac,
  Lu as ad,
  dn as ae,
  Cf as af,
  ce as ag,
  Fr as ah,
  cn as ai,
  bf as aj,
  wf as ak,
  fn as al,
  Wr as am,
  Tf as an,
  If as ao,
  Zf as ap,
  Vr as aq,
  qr as ar,
  Mf as as,
  Io as at,
  Af as au,
  Ff as av,
  No as aw,
  jf as ax,
  Rf as ay,
  Ur as az,
  hf as b,
  Uf as b0,
  $f as b1,
  Bn as c,
  Y as d,
  yr as e,
  mr as f,
  Uu as g,
  fr as h,
  Re as i,
  rr as j,
  Bu as k,
  He as l,
  ur as m,
  lf as n,
  sn as o,
  rn as p,
  sf as q,
  _r as r,
  ff as s,
  on as t,
  W as u,
  Ir as v,
  cf as w,
  Ke as x,
  uf as y,
  De as z,
};
