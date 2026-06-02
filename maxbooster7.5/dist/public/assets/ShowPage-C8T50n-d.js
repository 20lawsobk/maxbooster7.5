import {
  r as a,
  ah as _e,
  aH as Je,
  aI as es,
  f as e,
  aO as ss,
  b3 as rs,
  dG as as,
  da as ns,
  aj as ts,
  bv as is,
  fB as ls,
  fC as os,
  dB as cs,
  bk as ms,
  ai as us,
  y as hs,
  n as Ns,
  bu as gs,
  bc as ds,
  co as ps,
  bC as bs,
  be as xs,
  bf as fs,
  eo as ws,
  aV as vs,
  fD as Ss,
  cc as ke,
  bL as Pe,
  b5 as Ee,
  fd as ks,
  bd as Ps,
  aZ as Es,
} from "./vendor-react-31oK5L0i.js";
import { A as Ve } from "./AppLayout-D2pri0rw.js";
import { a as Vs } from "./useRequireAuth-K5x5riUd.js";
import {
  ai as js,
  u as Ds,
  aj as ys,
  T as Cs,
  B as Z,
  A as te,
  E as ie,
  j as l,
  F as le,
  S as oe,
  P as Ms,
  x as H,
  L as h,
  af as k,
  o as je,
  p as De,
  r as ye,
  v as Ce,
  W as Me,
  X as Te,
  Y as Be,
  Z as Ie,
  $ as T,
  V as Ts,
  ac as Fe,
  I as K,
  y as Bs,
  a as ce,
} from "./studio-DOUfHW5v.js";
import "./vendor-utils-C_Rs6IXs.js";
import "./vendor-ui-Ds7F22HT.js";
import "./vendor-state-Bxk_Qy8r.js";
import "./TopBar-jcH3P98k.js";
import "./index-D5xLbTBZ.js";
import "./vendor-animation-CFQslDag.js";
const Is = {
  enabled: !0,
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  volume: 0.5,
  accentFirstBeat: !0,
  subdivision: "quarter",
  countIn: 1,
};
function Fs(X) {
  const { context: n } = js(),
    [o, P] = a.useState({ ...Is, ...X }),
    [g, c] = a.useState({ isPlaying: !1, currentBeat: 0, currentMeasure: 0 }),
    B = a.useRef(),
    I = a.useRef(0),
    d = a.useRef(0),
    E = a.useRef(0),
    z = a.useCallback(() => {
      const t = 60 / o.bpm;
      switch (o.subdivision) {
        case "eighth":
          return t / 2;
        case "sixteenth":
          return t / 4;
        default:
          return t;
      }
    }, [o.bpm, o.subdivision]),
    G = a.useCallback(
      (t, N = !1) => {
        if (!n) return;
        const x = n.createOscillator(),
          f = n.createGain();
        ((x.frequency.value = N ? 1200 : 800),
          f.gain.setValueAtTime(o.volume * (N ? 1.2 : 1), t),
          f.gain.exponentialRampToValueAtTime(0.001, t + 0.03),
          x.connect(f),
          f.connect(n.destination),
          x.start(t),
          x.stop(t + 0.03));
      },
      [n, o.volume],
    ),
    v = a.useCallback(() => {
      if (!n) return;
      const t = n.currentTime,
        N = z();
      for (; I.current < t + 0.1; ) {
        const x = d.current === 0,
          f = o.accentFirstBeat && x;
        (G(I.current, f),
          d.current++,
          d.current >= o.timeSignature.numerator &&
            ((d.current = 0), E.current++),
          (I.current += N),
          c((j) => ({
            ...j,
            currentBeat: d.current,
            currentMeasure: E.current,
          })));
      }
      B.current = window.setTimeout(v, 25);
    }, [n, z, G, o.accentFirstBeat, o.timeSignature.numerator]),
    A = a.useCallback(() => {
      !n ||
        g.isPlaying ||
        ((d.current = 0),
        (E.current = 0),
        (I.current = n.currentTime),
        c((t) => ({ ...t, isPlaying: !0, currentBeat: 0, currentMeasure: 0 })),
        v());
    }, [n, g.isPlaying, v]),
    V = a.useCallback(() => {
      (B.current && clearTimeout(B.current),
        c((t) => ({ ...t, isPlaying: !1, currentBeat: 0, currentMeasure: 0 })));
    }, []),
    O = a.useCallback(
      async (t) => {
        if (!n) return;
        ((d.current = 0),
          (E.current = 0),
          (I.current = n.currentTime),
          c((q) => ({
            ...q,
            isPlaying: !0,
            currentBeat: 0,
            currentMeasure: 0,
          })));
        const N = o.countIn,
          x = o.timeSignature.numerator,
          f = N * x,
          j = () => {
            E.current * x + d.current >= f
              ? (V(), t())
              : requestAnimationFrame(j);
          };
        (v(), requestAnimationFrame(j));
      },
      [n, o.countIn, o.timeSignature.numerator, v, V],
    ),
    _ = a.useCallback((t) => {
      P((N) => ({ ...N, ...t }));
    }, []),
    R = a.useCallback((t) => {
      P((N) => ({ ...N, bpm: Math.max(20, Math.min(300, t)) }));
    }, []),
    J = a.useCallback((t, N) => {
      P((x) => ({ ...x, timeSignature: { numerator: t, denominator: N } }));
    }, []),
    F = a.useCallback((t) => {
      P((N) => ({ ...N, volume: Math.max(0, Math.min(1, t)) }));
    }, []),
    me = a.useCallback(() => {
      P((t) => ({ ...t, enabled: !t.enabled }));
    }, []);
  return (
    a.useEffect(
      () => () => {
        B.current && clearTimeout(B.current);
      },
      [],
    ),
    {
      ...o,
      ...g,
      start: A,
      stop: V,
      countIn: O,
      updateSettings: _,
      setBPM: R,
      setTimeSignature: J,
      setVolume: F,
      toggle: me,
    }
  );
}
function Ks() {
  const { isLoading: X } = Vs(),
    { toast: n } = Ds();
  _e();
  const {
      tempo: o,
      setTempo: P,
      isPlaying: g,
      setIsPlaying: c,
      currentTime: B,
      setCurrentTime: I,
      metronomeEnabled: d,
      setMetronomeEnabled: E,
      metronomeVolume: z,
      setMetronomeVolume: G,
    } = ys(),
    v = Fs({
      bpm: o,
      timeSignature: { numerator: 4, denominator: 4 },
      volume: z,
    }),
    A = a.useRef(v);
  A.current = v;
  const [V, O] = a.useState(!1),
    [_, R] = a.useState(!1),
    [J, F] = a.useState(!1),
    [me, t] = a.useState(!1),
    [N, x] = a.useState(null),
    [f, j] = a.useState(!0),
    [q, ue] = a.useState(!0),
    [he, ee] = a.useState(null),
    [$, qe] = a.useState(5),
    [Ne, ge] = a.useState(null),
    [ze, Ae] = a.useState("default"),
    [Oe, Re] = a.useState("default"),
    [D, de] = a.useState(!1),
    [se, qs] = a.useState([]),
    [Le, pe] = a.useState(32),
    [zs, As] = a.useState(1),
    [Os, be] = a.useState(!1),
    [p, U] = a.useState([
      {
        id: "1",
        title: "Opening Track",
        artist: "Your Band",
        duration: 240,
        bpm: 120,
        key: "C Major",
        notes: "High energy opener - full band intro",
        markers: [
          { time: 0, label: "Intro", color: "#3b82f6" },
          { time: 30, label: "Verse 1", color: "#10b981" },
          { time: 60, label: "Chorus", color: "#f59e0b" },
        ],
      },
      {
        id: "2",
        title: "Crowd Favorite",
        duration: 210,
        bpm: 128,
        key: "G Major",
        notes: "Extended outro - crowd sing-along",
      },
      {
        id: "3",
        title: "Ballad",
        duration: 300,
        bpm: 72,
        key: "A Minor",
        notes: "Acoustic intro - dimmed lights",
      },
    ]),
    [b, re] = a.useState(0),
    [xe, y] = a.useState(0),
    [ae] = a.useState([
      {
        id: "1",
        name: "Clean",
        category: "Guitar",
        parameters: { gain: 0.3, reverb: 0.2, delay: 0 },
      },
      {
        id: "2",
        name: "Crunch",
        category: "Guitar",
        parameters: { gain: 0.6, reverb: 0.3, delay: 0.1 },
      },
      {
        id: "3",
        name: "Lead",
        category: "Guitar",
        parameters: { gain: 0.8, reverb: 0.4, delay: 0.3 },
      },
      {
        id: "4",
        name: "Vocal Dry",
        category: "Vocal",
        parameters: { reverb: 0.1, delay: 0, compression: 0.5 },
      },
      {
        id: "5",
        name: "Vocal Wet",
        category: "Vocal",
        parameters: { reverb: 0.5, delay: 0.2, compression: 0.6 },
      },
    ]),
    [He, Ge] = a.useState("1"),
    [w, C] = a.useState({
      title: "",
      bpm: 120,
      key: "",
      duration: 240,
      notes: "",
    }),
    [m, M] = a.useState({
      masterVolume: 0.8,
      reverbMix: 0.3,
      delayMix: 0.2,
      compression: 0.5,
      eqLow: 0,
      eqMid: 0,
      eqHigh: 0,
    }),
    fe = a.useRef(null),
    S = a.useRef(null),
    L = a.useRef(null),
    { data: Q } = Je({
      queryKey: ["/api/shows/setlists"],
      queryFn: async () => (await ce("GET", "/api/shows/setlists")).json(),
    });
  a.useEffect(() => {
    if (Q && Q.length > 0) {
      const s = Q[0];
      (ge(s.id),
        Array.isArray(s.tracks) &&
          s.tracks.length > 0 &&
          U(
            s.tracks.map((r, i) => ({
              id: String(r.id || i + 1),
              title: r.title,
              artist: r.artist || "",
              duration:
                typeof r.duration == "string"
                  ? parseInt(r.duration) || 240
                  : r.duration || 240,
              bpm: r.bpm || 120,
              key: r.key || "",
              notes: r.notes || "",
              markers: r.markers || [],
            })),
          ));
    }
  }, [Q]);
  const we = es({
      mutationFn: async () => {
        const s = {
          name: "My Setlist",
          tracks: p.map((r) => ({
            title: r.title,
            duration: String(r.duration),
            key: r.key,
            bpm: r.bpm,
            notes: r.notes,
          })),
          totalDuration: p.reduce((r, i) => r + i.duration, 0),
        };
        if (Ne) return (await ce("PUT", `/api/shows/setlists/${Ne}`, s)).json();
        {
          const i = await (await ce("POST", "/api/shows/setlists", s)).json();
          return (ge(i.id), i);
        }
      },
      onSuccess: () => {
        n({ title: "Setlist saved" });
      },
      onError: () => {
        n({ title: "Failed to save setlist", variant: "destructive" });
      },
    }),
    u = a.useMemo(() => p[b], [p, b]);
  (a.useEffect(() => {
    u && P(u.bpm);
  }, [u, P]),
    a.useEffect(
      () => (
        g && u
          ? (L.current = window.setInterval(() => {
              y((s) => {
                const r = s + 0.1;
                return r >= u.duration ? (ve(), 0) : r;
              });
            }, 100))
          : L.current && clearInterval(L.current),
        () => {
          L.current && clearInterval(L.current);
        }
      ),
      [g, u],
    ),
    a.useEffect(() => {
      d && g ? A.current.start() : A.current.stop();
    }, [g, d]));
  const $e = a.useCallback(() => {
    document.fullscreenElement
      ? (document.exitFullscreen(), O(!1))
      : (fe.current?.requestFullscreen(), O(!0));
  }, []);
  (a.useEffect(() => {
    const s = () => {
      O(!!document.fullscreenElement);
    };
    return (
      document.addEventListener("fullscreenchange", s),
      () => document.removeEventListener("fullscreenchange", s)
    );
  }, []),
    a.useEffect(
      () => () => {
        S.current && (clearInterval(S.current), (S.current = null));
      },
      [],
    ));
  const Ue = a.useCallback(() => {
      (c(!0),
        be(!1),
        n({ title: "Playing", description: `Now playing: ${u?.title}` }));
    }, [c, u, n]),
    Qe = a.useCallback(() => {
      c(!1);
    }, [c]),
    ne = a.useCallback(() => {
      (c(!1), y(0));
    }, [c]),
    We = a.useCallback(() => {
      (c(!1),
        y(0),
        be(!0),
        S.current && (clearInterval(S.current), (S.current = null)),
        ee(null),
        v.stop(),
        n({
          title: "Emergency Stop",
          description: "All playback has been stopped immediately",
          variant: "destructive",
        }));
    }, [c, v, n]),
    ve = a.useCallback(() => {
      b < p.length - 1
        ? (c(!1),
          y(0),
          ee($),
          (S.current = window.setInterval(() => {
            ee((s) =>
              s === null || s <= 1
                ? (S.current && clearInterval(S.current),
                  re((r) => r + 1),
                  c(!0),
                  null)
                : s - 1,
            );
          }, 1e3)))
        : (ne(),
          n({
            title: "Set Complete",
            description: "You have finished the setlist!",
          }));
    }, [b, p.length, $, c, ne, n]),
    Ye = a.useCallback(() => {
      b > 0 && (re((s) => s - 1), y(0));
    }, [b]),
    Se = a.useCallback(
      (s, r) => {
        const i = [...p],
          Y = r === "up" ? s - 1 : s + 1;
        Y >= 0 && Y < i.length && (([i[s], i[Y]] = [i[Y], i[s]]), U(i));
      },
      [p],
    ),
    Ze = a.useCallback(
      (s) => {
        (U((r) => r.filter((i) => i.id !== s)),
          n({ title: "Song removed from setlist" }));
      },
      [n],
    ),
    Ke = a.useCallback(
      (s) => {
        (re(s), y(0), g && c(!1));
      },
      [g, c],
    ),
    W = (s) => {
      const r = Math.floor(s / 60),
        i = Math.floor(s % 60);
      return `${r}:${i.toString().padStart(2, "0")}`;
    },
    Xe = a.useCallback(
      (s) => {
        const r = ae.find((i) => i.id === s);
        r && (Ge(s), n({ title: "Preset Applied", description: r.name }));
      },
      [ae, n],
    );
  return X
    ? e.jsxDEV(
        Ve,
        {
          noPadding: !0,
          children: e.jsxDEV(
            "div",
            {
              className: "flex-1 flex items-center justify-center bg-black",
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
                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                  lineNumber: 441,
                  columnNumber: 11,
                },
                this,
              ),
            },
            void 0,
            !1,
            {
              fileName: "/home/runner/workspace/client/src/pages/ShowPage.tsx",
              lineNumber: 440,
              columnNumber: 9,
            },
            this,
          ),
        },
        void 0,
        !1,
        {
          fileName: "/home/runner/workspace/client/src/pages/ShowPage.tsx",
          lineNumber: 439,
          columnNumber: 7,
        },
        this,
      )
    : e.jsxDEV(
        Ve,
        {
          noPadding: !0,
          children: e.jsxDEV(
            Cs,
            {
              children: e.jsxDEV(
                "div",
                {
                  ref: fe,
                  className: `flex-1 bg-gray-950 text-white flex flex-col ${V ? "fixed inset-0 z-50" : ""}`,
                  children: [
                    e.jsxDEV(
                      "header",
                      {
                        className:
                          "h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0",
                        children: [
                          e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center gap-4",
                              children: [
                                e.jsxDEV(
                                  ss,
                                  { className: "w-6 h-6 text-primary" },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 458,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "span",
                                  {
                                    className: "font-bold text-lg",
                                    children: "Show Mode",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 459,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  Z,
                                  {
                                    variant: "outline",
                                    className:
                                      "border-green-500 text-green-400",
                                    children: [
                                      e.jsxDEV(
                                        rs,
                                        { className: "w-3 h-3 mr-1" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 461,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      "LIVE",
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 460,
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
                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                              lineNumber: 457,
                              columnNumber: 11,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "div",
                            {
                              className: "flex items-center gap-6",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-lg",
                                    children: [
                                      e.jsxDEV(
                                        as,
                                        { className: "w-4 h-4 text-blue-400" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 468,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "span",
                                        {
                                          className:
                                            "font-mono text-xl font-bold",
                                          children: o,
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 469,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "span",
                                        {
                                          className: "text-gray-400 text-sm",
                                          children: "BPM",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
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
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 467,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                u &&
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className: "text-center",
                                      children: [
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "text-sm text-gray-400",
                                            children: "Now Playing",
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                            lineNumber: 475,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className: "font-semibold",
                                            children: u.title,
                                          },
                                          void 0,
                                          !1,
                                          {
                                            fileName:
                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                            lineNumber: 476,
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
                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                      lineNumber: 474,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "flex items-center gap-2 font-mono text-xl",
                                    children: [
                                      e.jsxDEV(
                                        "span",
                                        {
                                          className: "text-gray-400",
                                          children: W(xe),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 481,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "span",
                                        {
                                          className: "text-gray-600",
                                          children: "/",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 482,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "span",
                                        { children: W(u?.duration || 0) },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 483,
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
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 480,
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
                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                              lineNumber: 466,
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
                                  te,
                                  {
                                    children: [
                                      e.jsxDEV(
                                        ie,
                                        {
                                          asChild: !0,
                                          children: e.jsxDEV(
                                            l,
                                            {
                                              variant: "ghost",
                                              size: "icon",
                                              onClick: () => de(!D),
                                              className: D
                                                ? "text-green-400"
                                                : "text-gray-400",
                                              children: D
                                                ? e.jsxDEV(
                                                    ns,
                                                    { className: "w-5 h-5" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                      lineNumber: 496,
                                                      columnNumber: 43,
                                                    },
                                                    this,
                                                  )
                                                : e.jsxDEV(
                                                    ts,
                                                    { className: "w-5 h-5" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                      lineNumber: 496,
                                                      columnNumber: 74,
                                                    },
                                                    this,
                                                  ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 490,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 489,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        le,
                                        {
                                          children: [
                                            "Remote Control (",
                                            D ? "On" : "Off",
                                            ")",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 499,
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
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 488,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  te,
                                  {
                                    children: [
                                      e.jsxDEV(
                                        ie,
                                        {
                                          asChild: !0,
                                          children: e.jsxDEV(
                                            l,
                                            {
                                              variant: "ghost",
                                              size: "icon",
                                              onClick: () => R(!0),
                                              children: e.jsxDEV(
                                                is,
                                                { className: "w-5 h-5" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                  lineNumber: 505,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 504,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 503,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        le,
                                        { children: "Settings" },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 508,
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
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 502,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  te,
                                  {
                                    children: [
                                      e.jsxDEV(
                                        ie,
                                        {
                                          asChild: !0,
                                          children: e.jsxDEV(
                                            l,
                                            {
                                              variant: "ghost",
                                              size: "icon",
                                              onClick: $e,
                                              children: V
                                                ? e.jsxDEV(
                                                    ls,
                                                    { className: "w-5 h-5" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                      lineNumber: 514,
                                                      columnNumber: 35,
                                                    },
                                                    this,
                                                  )
                                                : e.jsxDEV(
                                                    os,
                                                    { className: "w-5 h-5" },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                      lineNumber: 514,
                                                      columnNumber: 70,
                                                    },
                                                    this,
                                                  ),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 513,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 512,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        le,
                                        {
                                          children: V
                                            ? "Exit Fullscreen"
                                            : "Fullscreen",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 517,
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
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 511,
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
                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                              lineNumber: 487,
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
                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                        lineNumber: 456,
                        columnNumber: 9,
                      },
                      this,
                    ),
                    he !== null &&
                      e.jsxDEV(
                        "div",
                        {
                          className:
                            "fixed inset-0 bg-black/90 z-50 flex items-center justify-center",
                          children: e.jsxDEV(
                            "div",
                            {
                              className: "text-center",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-2xl text-gray-400 mb-4",
                                    children: "Next Song",
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 525,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "text-8xl font-bold text-primary animate-pulse",
                                    children: he,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 526,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-3xl mt-4 text-white",
                                    children: p[b + 1]?.title,
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 527,
                                    columnNumber: 15,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "text-xl text-gray-400 mt-2",
                                    children: [
                                      p[b + 1]?.bpm,
                                      " BPM • ",
                                      p[b + 1]?.key,
                                    ],
                                  },
                                  void 0,
                                  !0,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 528,
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
                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                              lineNumber: 524,
                              columnNumber: 13,
                            },
                            this,
                          ),
                        },
                        void 0,
                        !1,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                          lineNumber: 523,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    e.jsxDEV(
                      "div",
                      {
                        className: "flex-1 flex overflow-hidden",
                        children: [
                          e.jsxDEV(
                            "aside",
                            {
                              className:
                                "w-72 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "p-3 border-b border-gray-800 flex items-center justify-between",
                                    children: [
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: "flex items-center gap-2",
                                          children: [
                                            e.jsxDEV(
                                              cs,
                                              { className: "w-4 h-4" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                lineNumber: 539,
                                                columnNumber: 17,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "span",
                                              {
                                                className: "font-semibold",
                                                children: "Setlist",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                lineNumber: 540,
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
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 538,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className: "flex items-center gap-1",
                                          children: [
                                            e.jsxDEV(
                                              l,
                                              {
                                                variant: "ghost",
                                                size: "sm",
                                                className:
                                                  "h-7 px-2 text-xs text-gray-400 hover:text-white",
                                                onClick: () => we.mutate(),
                                                disabled: we.isPending,
                                                title: "Save setlist",
                                                children: [
                                                  e.jsxDEV(
                                                    ms,
                                                    {
                                                      className: "w-3 h-3 mr-1",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                      lineNumber: 551,
                                                      columnNumber: 19,
                                                    },
                                                    this,
                                                  ),
                                                  "Save",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                lineNumber: 543,
                                                columnNumber: 17,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              l,
                                              {
                                                variant: "ghost",
                                                size: "icon",
                                                className: "h-7 w-7",
                                                onClick: () => F(!0),
                                                children: e.jsxDEV(
                                                  us,
                                                  { className: "w-4 h-4" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 555,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                lineNumber: 554,
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
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 542,
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
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 537,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  oe,
                                  {
                                    className: "flex-1",
                                    children: e.jsxDEV(
                                      "div",
                                      {
                                        className: "p-2 space-y-1",
                                        children: p.map((s, r) =>
                                          e.jsxDEV(
                                            "div",
                                            {
                                              onClick: () => Ke(r),
                                              className: `group p-3 rounded-lg cursor-pointer transition-all ${r === b ? "bg-primary/20 border border-primary/50" : "bg-gray-800/50 hover:bg-gray-800 border border-transparent"}`,
                                              children: [
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "flex items-start justify-between",
                                                    children: [
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "flex items-center gap-2",
                                                          children: [
                                                            e.jsxDEV(
                                                              "span",
                                                              {
                                                                className:
                                                                  "text-xs text-gray-500 w-5",
                                                                children: r + 1,
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                lineNumber: 574,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              "div",
                                                              {
                                                                children: [
                                                                  e.jsxDEV(
                                                                    "div",
                                                                    {
                                                                      className:
                                                                        "font-medium text-sm",
                                                                      children:
                                                                        s.title,
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                      lineNumber: 576,
                                                                      columnNumber: 27,
                                                                    },
                                                                    this,
                                                                  ),
                                                                  e.jsxDEV(
                                                                    "div",
                                                                    {
                                                                      className:
                                                                        "text-xs text-gray-400 flex items-center gap-2 mt-0.5",
                                                                      children:
                                                                        [
                                                                          e.jsxDEV(
                                                                            "span",
                                                                            {
                                                                              children:
                                                                                W(
                                                                                  s.duration,
                                                                                ),
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                              lineNumber: 578,
                                                                              columnNumber: 29,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          e.jsxDEV(
                                                                            "span",
                                                                            {
                                                                              children:
                                                                                "•",
                                                                            },
                                                                            void 0,
                                                                            !1,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                              lineNumber: 579,
                                                                              columnNumber: 29,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          e.jsxDEV(
                                                                            "span",
                                                                            {
                                                                              children:
                                                                                [
                                                                                  s.bpm,
                                                                                  " BPM",
                                                                                ],
                                                                            },
                                                                            void 0,
                                                                            !0,
                                                                            {
                                                                              fileName:
                                                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                              lineNumber: 580,
                                                                              columnNumber: 29,
                                                                            },
                                                                            this,
                                                                          ),
                                                                          s.key &&
                                                                            e.jsxDEV(
                                                                              e.Fragment,
                                                                              {
                                                                                children:
                                                                                  [
                                                                                    e.jsxDEV(
                                                                                      "span",
                                                                                      {
                                                                                        children:
                                                                                          "•",
                                                                                      },
                                                                                      void 0,
                                                                                      !1,
                                                                                      {
                                                                                        fileName:
                                                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                                        lineNumber: 583,
                                                                                        columnNumber: 33,
                                                                                      },
                                                                                      this,
                                                                                    ),
                                                                                    e.jsxDEV(
                                                                                      "span",
                                                                                      {
                                                                                        children:
                                                                                          s.key,
                                                                                      },
                                                                                      void 0,
                                                                                      !1,
                                                                                      {
                                                                                        fileName:
                                                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                                        lineNumber: 584,
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
                                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                                lineNumber: 582,
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
                                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                      lineNumber: 577,
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
                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                lineNumber: 575,
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
                                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                          lineNumber: 573,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
                                                          children: [
                                                            e.jsxDEV(
                                                              l,
                                                              {
                                                                variant:
                                                                  "ghost",
                                                                size: "icon",
                                                                className:
                                                                  "h-6 w-6",
                                                                onClick: (
                                                                  i,
                                                                ) => {
                                                                  (i.stopPropagation(),
                                                                    Se(
                                                                      r,
                                                                      "up",
                                                                    ));
                                                                },
                                                                disabled:
                                                                  r === 0,
                                                                children:
                                                                  e.jsxDEV(
                                                                    hs,
                                                                    {
                                                                      className:
                                                                        "w-3 h-3",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                      lineNumber: 598,
                                                                      columnNumber: 27,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                lineNumber: 591,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              l,
                                                              {
                                                                variant:
                                                                  "ghost",
                                                                size: "icon",
                                                                className:
                                                                  "h-6 w-6",
                                                                onClick: (
                                                                  i,
                                                                ) => {
                                                                  (i.stopPropagation(),
                                                                    Se(
                                                                      r,
                                                                      "down",
                                                                    ));
                                                                },
                                                                disabled:
                                                                  r ===
                                                                  p.length - 1,
                                                                children:
                                                                  e.jsxDEV(
                                                                    Ns,
                                                                    {
                                                                      className:
                                                                        "w-3 h-3",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                      lineNumber: 607,
                                                                      columnNumber: 27,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                lineNumber: 600,
                                                                columnNumber: 25,
                                                              },
                                                              this,
                                                            ),
                                                            e.jsxDEV(
                                                              l,
                                                              {
                                                                variant:
                                                                  "ghost",
                                                                size: "icon",
                                                                className:
                                                                  "h-6 w-6 text-red-400 hover:text-red-300",
                                                                onClick: (
                                                                  i,
                                                                ) => {
                                                                  (i.stopPropagation(),
                                                                    Ze(s.id));
                                                                },
                                                                children:
                                                                  e.jsxDEV(
                                                                    gs,
                                                                    {
                                                                      className:
                                                                        "w-3 h-3",
                                                                    },
                                                                    void 0,
                                                                    !1,
                                                                    {
                                                                      fileName:
                                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                      lineNumber: 615,
                                                                      columnNumber: 27,
                                                                    },
                                                                    this,
                                                                  ),
                                                              },
                                                              void 0,
                                                              !1,
                                                              {
                                                                fileName:
                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                lineNumber: 609,
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
                                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                          lineNumber: 590,
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
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 572,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                s.notes &&
                                                  e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "mt-2 text-xs text-gray-500 flex items-start gap-1",
                                                      children: [
                                                        e.jsxDEV(
                                                          ds,
                                                          {
                                                            className:
                                                              "w-3 h-3 mt-0.5 shrink-0",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                            lineNumber: 621,
                                                            columnNumber: 25,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "span",
                                                          {
                                                            className:
                                                              "line-clamp-2",
                                                            children: s.notes,
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                            lineNumber: 622,
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
                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                      lineNumber: 620,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                                r === b &&
                                                  g &&
                                                  e.jsxDEV(
                                                    Ms,
                                                    {
                                                      value:
                                                        (xe / s.duration) * 100,
                                                      className: "mt-2 h-1",
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                      lineNumber: 626,
                                                      columnNumber: 23,
                                                    },
                                                    this,
                                                  ),
                                              ],
                                            },
                                            s.id,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 563,
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
                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                        lineNumber: 561,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                  },
                                  void 0,
                                  !1,
                                  {
                                    fileName:
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 560,
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
                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                              lineNumber: 536,
                              columnNumber: 11,
                            },
                            this,
                          ),
                          e.jsxDEV(
                            "main",
                            {
                              className: "flex-1 flex flex-col overflow-hidden",
                              children: [
                                e.jsxDEV(
                                  "div",
                                  {
                                    className:
                                      "h-20 bg-gray-900/50 border-b border-gray-800 flex items-center justify-center gap-4 shrink-0",
                                    children: [
                                      e.jsxDEV(
                                        l,
                                        {
                                          variant: "ghost",
                                          size: "icon",
                                          className: "h-12 w-12",
                                          onClick: Ye,
                                          disabled: b === 0,
                                          children: e.jsxDEV(
                                            ps,
                                            { className: "w-6 h-6" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 646,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 639,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        l,
                                        {
                                          variant: "ghost",
                                          size: "icon",
                                          className: "h-12 w-12",
                                          onClick: ne,
                                          children: e.jsxDEV(
                                            bs,
                                            { className: "w-6 h-6" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 655,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 649,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        l,
                                        {
                                          className: `h-16 w-16 rounded-full ${g ? "bg-primary hover:bg-primary/80" : "bg-green-600 hover:bg-green-700"}`,
                                          onClick: () => (g ? Qe() : Ue()),
                                          children: g
                                            ? e.jsxDEV(
                                                xs,
                                                { className: "w-8 h-8" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                  lineNumber: 662,
                                                  columnNumber: 30,
                                                },
                                                this,
                                              )
                                            : e.jsxDEV(
                                                fs,
                                                { className: "w-8 h-8 ml-1" },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                  lineNumber: 662,
                                                  columnNumber: 62,
                                                },
                                                this,
                                              ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 658,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        l,
                                        {
                                          variant: "ghost",
                                          size: "icon",
                                          className: "h-12 w-12",
                                          onClick: ve,
                                          disabled: b === p.length - 1,
                                          children: e.jsxDEV(
                                            ws,
                                            { className: "w-6 h-6" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 672,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 665,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        H,
                                        {
                                          orientation: "vertical",
                                          className: "h-8 mx-4",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 675,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        l,
                                        {
                                          variant: d ? "default" : "ghost",
                                          size: "sm",
                                          onClick: () => E(!d),
                                          className: d
                                            ? "bg-blue-600 hover:bg-blue-700"
                                            : "",
                                          children: [
                                            e.jsxDEV(
                                              vs,
                                              { className: "w-4 h-4 mr-2" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                lineNumber: 683,
                                                columnNumber: 17,
                                              },
                                              this,
                                            ),
                                            "Click Track",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 677,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        H,
                                        {
                                          orientation: "vertical",
                                          className: "h-8 mx-4",
                                        },
                                        void 0,
                                        !1,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 687,
                                          columnNumber: 15,
                                        },
                                        this,
                                      ),
                                      e.jsxDEV(
                                        l,
                                        {
                                          variant: "destructive",
                                          size: "lg",
                                          className:
                                            "bg-red-600 hover:bg-red-700 font-bold px-6",
                                          onClick: We,
                                          children: [
                                            e.jsxDEV(
                                              Ss,
                                              { className: "w-5 h-5 mr-2" },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                lineNumber: 695,
                                                columnNumber: 17,
                                              },
                                              this,
                                            ),
                                            "EMERGENCY STOP",
                                          ],
                                        },
                                        void 0,
                                        !0,
                                        {
                                          fileName:
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 689,
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
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 638,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                e.jsxDEV(
                                  "div",
                                  {
                                    className: "flex-1 flex overflow-hidden",
                                    children: [
                                      f &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "flex-1 bg-black p-6 flex flex-col",
                                            children: [
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "flex items-center justify-between mb-4",
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center gap-2",
                                                        children: [
                                                          e.jsxDEV(
                                                            ke,
                                                            {
                                                              className:
                                                                "w-5 h-5 text-blue-400",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                              lineNumber: 705,
                                                              columnNumber: 23,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "span",
                                                            {
                                                              className:
                                                                "font-semibold",
                                                              children:
                                                                "Teleprompter",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                              lineNumber: 706,
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
                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                        lineNumber: 704,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center gap-2",
                                                        children: [
                                                          e.jsxDEV(
                                                            l,
                                                            {
                                                              variant: "ghost",
                                                              size: "sm",
                                                              onClick: () =>
                                                                pe((s) =>
                                                                  Math.max(
                                                                    16,
                                                                    s - 4,
                                                                  ),
                                                                ),
                                                              children:
                                                                e.jsxDEV(
                                                                  "span",
                                                                  {
                                                                    className:
                                                                      "text-xs",
                                                                    children:
                                                                      "A-",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                    lineNumber: 710,
                                                                    columnNumber: 25,
                                                                  },
                                                                  this,
                                                                ),
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                              lineNumber: 709,
                                                              columnNumber: 23,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            l,
                                                            {
                                                              variant: "ghost",
                                                              size: "sm",
                                                              onClick: () =>
                                                                pe((s) =>
                                                                  Math.min(
                                                                    64,
                                                                    s + 4,
                                                                  ),
                                                                ),
                                                              children:
                                                                e.jsxDEV(
                                                                  "span",
                                                                  {
                                                                    className:
                                                                      "text-lg",
                                                                    children:
                                                                      "A+",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                    lineNumber: 713,
                                                                    columnNumber: 25,
                                                                  },
                                                                  this,
                                                                ),
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                              lineNumber: 712,
                                                              columnNumber: 23,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            l,
                                                            {
                                                              variant: "ghost",
                                                              size: "icon",
                                                              onClick: () =>
                                                                j(!1),
                                                              children:
                                                                e.jsxDEV(
                                                                  Pe,
                                                                  {
                                                                    className:
                                                                      "w-4 h-4",
                                                                  },
                                                                  void 0,
                                                                  !1,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                    lineNumber: 716,
                                                                    columnNumber: 25,
                                                                  },
                                                                  this,
                                                                ),
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                              lineNumber: 715,
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
                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                        lineNumber: 708,
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
                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                  lineNumber: 703,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                oe,
                                                {
                                                  className: "flex-1",
                                                  children: e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "text-center leading-relaxed text-gray-300",
                                                      style: { fontSize: Le },
                                                      children: u?.notes
                                                        ? e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "whitespace-pre-wrap",
                                                              children: u.notes,
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                              lineNumber: 727,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          )
                                                        : e.jsxDEV(
                                                            "div",
                                                            {
                                                              className:
                                                                "text-gray-500 italic",
                                                              children:
                                                                "No lyrics or notes for this song",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                              lineNumber: 729,
                                                              columnNumber: 25,
                                                            },
                                                            this,
                                                          ),
                                                    },
                                                    void 0,
                                                    !1,
                                                    {
                                                      fileName:
                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                      lineNumber: 722,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                  lineNumber: 721,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              u?.markers &&
                                                u.markers.length > 0 &&
                                                e.jsxDEV(
                                                  "div",
                                                  {
                                                    className:
                                                      "mt-4 pt-4 border-t border-gray-800",
                                                    children: [
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "text-sm text-gray-400 mb-2",
                                                          children:
                                                            "Song Markers",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                          lineNumber: 736,
                                                          columnNumber: 23,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        "div",
                                                        {
                                                          className:
                                                            "flex flex-wrap gap-2",
                                                          children:
                                                            u.markers.map(
                                                              (s, r) =>
                                                                e.jsxDEV(
                                                                  Z,
                                                                  {
                                                                    variant:
                                                                      "outline",
                                                                    style: {
                                                                      borderColor:
                                                                        s.color,
                                                                      color:
                                                                        s.color,
                                                                    },
                                                                    className:
                                                                      "cursor-pointer hover:opacity-80",
                                                                    onClick:
                                                                      () =>
                                                                        y(
                                                                          s.time,
                                                                        ),
                                                                    children: [
                                                                      W(s.time),
                                                                      " - ",
                                                                      s.label,
                                                                    ],
                                                                  },
                                                                  r,
                                                                  !0,
                                                                  {
                                                                    fileName:
                                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                    lineNumber: 739,
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
                                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                          lineNumber: 737,
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
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 735,
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
                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                            lineNumber: 702,
                                            columnNumber: 17,
                                          },
                                          this,
                                        ),
                                      q &&
                                        e.jsxDEV(
                                          "div",
                                          {
                                            className:
                                              "w-80 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0",
                                            children: [
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "p-3 border-b border-gray-800 flex items-center justify-between",
                                                  children: [
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "flex items-center gap-2",
                                                        children: [
                                                          e.jsxDEV(
                                                            Ee,
                                                            {
                                                              className:
                                                                "w-4 h-4 text-purple-400",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                              lineNumber: 759,
                                                              columnNumber: 23,
                                                            },
                                                            this,
                                                          ),
                                                          e.jsxDEV(
                                                            "span",
                                                            {
                                                              className:
                                                                "font-semibold",
                                                              children:
                                                                "Effects Control",
                                                            },
                                                            void 0,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                              lineNumber: 760,
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
                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                        lineNumber: 758,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      l,
                                                      {
                                                        variant: "ghost",
                                                        size: "icon",
                                                        className: "h-7 w-7",
                                                        onClick: () => ue(!1),
                                                        children: e.jsxDEV(
                                                          Pe,
                                                          {
                                                            className:
                                                              "w-4 h-4",
                                                          },
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                            lineNumber: 763,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                        lineNumber: 762,
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
                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                  lineNumber: 757,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                "div",
                                                {
                                                  className:
                                                    "p-4 border-b border-gray-800",
                                                  children: [
                                                    e.jsxDEV(
                                                      h,
                                                      {
                                                        className:
                                                          "text-xs text-gray-400 mb-2 block",
                                                        children:
                                                          "Quick Presets",
                                                      },
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                        lineNumber: 768,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                    e.jsxDEV(
                                                      "div",
                                                      {
                                                        className:
                                                          "grid grid-cols-2 gap-2",
                                                        children: ae.map((s) =>
                                                          e.jsxDEV(
                                                            l,
                                                            {
                                                              variant:
                                                                He === s.id
                                                                  ? "default"
                                                                  : "outline",
                                                              size: "sm",
                                                              onClick: () =>
                                                                Xe(s.id),
                                                              className:
                                                                "text-xs",
                                                              children: s.name,
                                                            },
                                                            s.id,
                                                            !1,
                                                            {
                                                              fileName:
                                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                              lineNumber: 771,
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
                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                        lineNumber: 769,
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
                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                  lineNumber: 767,
                                                  columnNumber: 19,
                                                },
                                                this,
                                              ),
                                              e.jsxDEV(
                                                oe,
                                                {
                                                  className: "flex-1",
                                                  children: e.jsxDEV(
                                                    "div",
                                                    {
                                                      className:
                                                        "p-4 space-y-6",
                                                      children: [
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            children: [
                                                              e.jsxDEV(
                                                                h,
                                                                {
                                                                  className:
                                                                    "text-xs text-gray-400 mb-3 flex items-center justify-between",
                                                                  children: [
                                                                    e.jsxDEV(
                                                                      "span",
                                                                      {
                                                                        children:
                                                                          "Master Volume",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                        lineNumber: 788,
                                                                        columnNumber: 27,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    e.jsxDEV(
                                                                      "span",
                                                                      {
                                                                        className:
                                                                          "font-mono",
                                                                        children:
                                                                          [
                                                                            Math.round(
                                                                              m.masterVolume *
                                                                                100,
                                                                            ),
                                                                            "%",
                                                                          ],
                                                                      },
                                                                      void 0,
                                                                      !0,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                        lineNumber: 789,
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
                                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                  lineNumber: 787,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                k,
                                                                {
                                                                  value: [
                                                                    m.masterVolume,
                                                                  ],
                                                                  max: 1,
                                                                  step: 0.01,
                                                                  onValueChange:
                                                                    ([s]) =>
                                                                      M(
                                                                        (
                                                                          r,
                                                                        ) => ({
                                                                          ...r,
                                                                          masterVolume:
                                                                            s,
                                                                        }),
                                                                      ),
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                  lineNumber: 791,
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
                                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                            lineNumber: 786,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          H,
                                                          {},
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                            lineNumber: 799,
                                                            columnNumber: 23,
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
                                                                  className:
                                                                    "text-xs text-gray-400 mb-3 flex items-center justify-between",
                                                                  children: [
                                                                    e.jsxDEV(
                                                                      "span",
                                                                      {
                                                                        children:
                                                                          "Reverb Mix",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                        lineNumber: 803,
                                                                        columnNumber: 27,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    e.jsxDEV(
                                                                      "span",
                                                                      {
                                                                        className:
                                                                          "font-mono",
                                                                        children:
                                                                          [
                                                                            Math.round(
                                                                              m.reverbMix *
                                                                                100,
                                                                            ),
                                                                            "%",
                                                                          ],
                                                                      },
                                                                      void 0,
                                                                      !0,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                        lineNumber: 804,
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
                                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                  lineNumber: 802,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                k,
                                                                {
                                                                  value: [
                                                                    m.reverbMix,
                                                                  ],
                                                                  max: 1,
                                                                  step: 0.01,
                                                                  onValueChange:
                                                                    ([s]) =>
                                                                      M(
                                                                        (
                                                                          r,
                                                                        ) => ({
                                                                          ...r,
                                                                          reverbMix:
                                                                            s,
                                                                        }),
                                                                      ),
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                  lineNumber: 806,
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
                                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                            lineNumber: 801,
                                                            columnNumber: 23,
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
                                                                  className:
                                                                    "text-xs text-gray-400 mb-3 flex items-center justify-between",
                                                                  children: [
                                                                    e.jsxDEV(
                                                                      "span",
                                                                      {
                                                                        children:
                                                                          "Delay Mix",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                        lineNumber: 816,
                                                                        columnNumber: 27,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    e.jsxDEV(
                                                                      "span",
                                                                      {
                                                                        className:
                                                                          "font-mono",
                                                                        children:
                                                                          [
                                                                            Math.round(
                                                                              m.delayMix *
                                                                                100,
                                                                            ),
                                                                            "%",
                                                                          ],
                                                                      },
                                                                      void 0,
                                                                      !0,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                        lineNumber: 817,
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
                                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                  lineNumber: 815,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                k,
                                                                {
                                                                  value: [
                                                                    m.delayMix,
                                                                  ],
                                                                  max: 1,
                                                                  step: 0.01,
                                                                  onValueChange:
                                                                    ([s]) =>
                                                                      M(
                                                                        (
                                                                          r,
                                                                        ) => ({
                                                                          ...r,
                                                                          delayMix:
                                                                            s,
                                                                        }),
                                                                      ),
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                  lineNumber: 819,
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
                                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                            lineNumber: 814,
                                                            columnNumber: 23,
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
                                                                  className:
                                                                    "text-xs text-gray-400 mb-3 flex items-center justify-between",
                                                                  children: [
                                                                    e.jsxDEV(
                                                                      "span",
                                                                      {
                                                                        children:
                                                                          "Compression",
                                                                      },
                                                                      void 0,
                                                                      !1,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                        lineNumber: 829,
                                                                        columnNumber: 27,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    e.jsxDEV(
                                                                      "span",
                                                                      {
                                                                        className:
                                                                          "font-mono",
                                                                        children:
                                                                          [
                                                                            Math.round(
                                                                              m.compression *
                                                                                100,
                                                                            ),
                                                                            "%",
                                                                          ],
                                                                      },
                                                                      void 0,
                                                                      !0,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                        lineNumber: 830,
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
                                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                  lineNumber: 828,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                k,
                                                                {
                                                                  value: [
                                                                    m.compression,
                                                                  ],
                                                                  max: 1,
                                                                  step: 0.01,
                                                                  onValueChange:
                                                                    ([s]) =>
                                                                      M(
                                                                        (
                                                                          r,
                                                                        ) => ({
                                                                          ...r,
                                                                          compression:
                                                                            s,
                                                                        }),
                                                                      ),
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                  lineNumber: 832,
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
                                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                            lineNumber: 827,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          H,
                                                          {},
                                                          void 0,
                                                          !1,
                                                          {
                                                            fileName:
                                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                            lineNumber: 840,
                                                            columnNumber: 23,
                                                          },
                                                          this,
                                                        ),
                                                        e.jsxDEV(
                                                          "div",
                                                          {
                                                            className:
                                                              "space-y-3",
                                                            children: [
                                                              e.jsxDEV(
                                                                h,
                                                                {
                                                                  className:
                                                                    "text-xs text-gray-400",
                                                                  children:
                                                                    "EQ",
                                                                },
                                                                void 0,
                                                                !1,
                                                                {
                                                                  fileName:
                                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                  lineNumber: 843,
                                                                  columnNumber: 25,
                                                                },
                                                                this,
                                                              ),
                                                              e.jsxDEV(
                                                                "div",
                                                                {
                                                                  className:
                                                                    "flex justify-between gap-4",
                                                                  children: [
                                                                    e.jsxDEV(
                                                                      "div",
                                                                      {
                                                                        className:
                                                                          "flex-1 text-center",
                                                                        children:
                                                                          [
                                                                            e.jsxDEV(
                                                                              "div",
                                                                              {
                                                                                className:
                                                                                  "text-xs text-gray-500 mb-1",
                                                                                children:
                                                                                  "Low",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                                lineNumber: 846,
                                                                                columnNumber: 29,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              k,
                                                                              {
                                                                                orientation:
                                                                                  "vertical",
                                                                                value:
                                                                                  [
                                                                                    m.eqLow +
                                                                                      12,
                                                                                  ],
                                                                                max: 24,
                                                                                step: 0.5,
                                                                                className:
                                                                                  "h-24 mx-auto",
                                                                                onValueChange:
                                                                                  ([
                                                                                    s,
                                                                                  ]) =>
                                                                                    M(
                                                                                      (
                                                                                        r,
                                                                                      ) => ({
                                                                                        ...r,
                                                                                        eqLow:
                                                                                          s -
                                                                                          12,
                                                                                      }),
                                                                                    ),
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                                lineNumber: 847,
                                                                                columnNumber: 29,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              "div",
                                                                              {
                                                                                className:
                                                                                  "text-xs font-mono mt-1",
                                                                                children:
                                                                                  [
                                                                                    m.eqLow >
                                                                                    0
                                                                                      ? "+"
                                                                                      : "",
                                                                                    m.eqLow,
                                                                                    "dB",
                                                                                  ],
                                                                              },
                                                                              void 0,
                                                                              !0,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                                lineNumber: 855,
                                                                                columnNumber: 29,
                                                                              },
                                                                              this,
                                                                            ),
                                                                          ],
                                                                      },
                                                                      void 0,
                                                                      !0,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                        lineNumber: 845,
                                                                        columnNumber: 27,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    e.jsxDEV(
                                                                      "div",
                                                                      {
                                                                        className:
                                                                          "flex-1 text-center",
                                                                        children:
                                                                          [
                                                                            e.jsxDEV(
                                                                              "div",
                                                                              {
                                                                                className:
                                                                                  "text-xs text-gray-500 mb-1",
                                                                                children:
                                                                                  "Mid",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                                lineNumber: 858,
                                                                                columnNumber: 29,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              k,
                                                                              {
                                                                                orientation:
                                                                                  "vertical",
                                                                                value:
                                                                                  [
                                                                                    m.eqMid +
                                                                                      12,
                                                                                  ],
                                                                                max: 24,
                                                                                step: 0.5,
                                                                                className:
                                                                                  "h-24 mx-auto",
                                                                                onValueChange:
                                                                                  ([
                                                                                    s,
                                                                                  ]) =>
                                                                                    M(
                                                                                      (
                                                                                        r,
                                                                                      ) => ({
                                                                                        ...r,
                                                                                        eqMid:
                                                                                          s -
                                                                                          12,
                                                                                      }),
                                                                                    ),
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                                lineNumber: 859,
                                                                                columnNumber: 29,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              "div",
                                                                              {
                                                                                className:
                                                                                  "text-xs font-mono mt-1",
                                                                                children:
                                                                                  [
                                                                                    m.eqMid >
                                                                                    0
                                                                                      ? "+"
                                                                                      : "",
                                                                                    m.eqMid,
                                                                                    "dB",
                                                                                  ],
                                                                              },
                                                                              void 0,
                                                                              !0,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                                lineNumber: 867,
                                                                                columnNumber: 29,
                                                                              },
                                                                              this,
                                                                            ),
                                                                          ],
                                                                      },
                                                                      void 0,
                                                                      !0,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                        lineNumber: 857,
                                                                        columnNumber: 27,
                                                                      },
                                                                      this,
                                                                    ),
                                                                    e.jsxDEV(
                                                                      "div",
                                                                      {
                                                                        className:
                                                                          "flex-1 text-center",
                                                                        children:
                                                                          [
                                                                            e.jsxDEV(
                                                                              "div",
                                                                              {
                                                                                className:
                                                                                  "text-xs text-gray-500 mb-1",
                                                                                children:
                                                                                  "High",
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                                lineNumber: 870,
                                                                                columnNumber: 29,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              k,
                                                                              {
                                                                                orientation:
                                                                                  "vertical",
                                                                                value:
                                                                                  [
                                                                                    m.eqHigh +
                                                                                      12,
                                                                                  ],
                                                                                max: 24,
                                                                                step: 0.5,
                                                                                className:
                                                                                  "h-24 mx-auto",
                                                                                onValueChange:
                                                                                  ([
                                                                                    s,
                                                                                  ]) =>
                                                                                    M(
                                                                                      (
                                                                                        r,
                                                                                      ) => ({
                                                                                        ...r,
                                                                                        eqHigh:
                                                                                          s -
                                                                                          12,
                                                                                      }),
                                                                                    ),
                                                                              },
                                                                              void 0,
                                                                              !1,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                                lineNumber: 871,
                                                                                columnNumber: 29,
                                                                              },
                                                                              this,
                                                                            ),
                                                                            e.jsxDEV(
                                                                              "div",
                                                                              {
                                                                                className:
                                                                                  "text-xs font-mono mt-1",
                                                                                children:
                                                                                  [
                                                                                    m.eqHigh >
                                                                                    0
                                                                                      ? "+"
                                                                                      : "",
                                                                                    m.eqHigh,
                                                                                    "dB",
                                                                                  ],
                                                                              },
                                                                              void 0,
                                                                              !0,
                                                                              {
                                                                                fileName:
                                                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                                lineNumber: 879,
                                                                                columnNumber: 29,
                                                                              },
                                                                              this,
                                                                            ),
                                                                          ],
                                                                      },
                                                                      void 0,
                                                                      !0,
                                                                      {
                                                                        fileName:
                                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                        lineNumber: 869,
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
                                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                                  lineNumber: 844,
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
                                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                            lineNumber: 842,
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
                                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                      lineNumber: 785,
                                                      columnNumber: 21,
                                                    },
                                                    this,
                                                  ),
                                                },
                                                void 0,
                                                !1,
                                                {
                                                  fileName:
                                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                  lineNumber: 784,
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
                                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                            lineNumber: 756,
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
                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                    lineNumber: 700,
                                    columnNumber: 13,
                                  },
                                  this,
                                ),
                                (!f || !q) &&
                                  e.jsxDEV(
                                    "div",
                                    {
                                      className:
                                        "absolute bottom-4 right-4 flex gap-2",
                                      children: [
                                        !f &&
                                          e.jsxDEV(
                                            l,
                                            {
                                              variant: "outline",
                                              size: "sm",
                                              onClick: () => j(!0),
                                              children: [
                                                e.jsxDEV(
                                                  ke,
                                                  { className: "w-4 h-4 mr-2" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 893,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                "Show Teleprompter",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 892,
                                              columnNumber: 19,
                                            },
                                            this,
                                          ),
                                        !q &&
                                          e.jsxDEV(
                                            l,
                                            {
                                              variant: "outline",
                                              size: "sm",
                                              onClick: () => ue(!0),
                                              children: [
                                                e.jsxDEV(
                                                  Ee,
                                                  { className: "w-4 h-4 mr-2" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 899,
                                                    columnNumber: 21,
                                                  },
                                                  this,
                                                ),
                                                "Show Effects",
                                              ],
                                            },
                                            void 0,
                                            !0,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 898,
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
                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                      lineNumber: 890,
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
                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                              lineNumber: 637,
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
                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                        lineNumber: 535,
                        columnNumber: 9,
                      },
                      this,
                    ),
                    D &&
                      se.length > 0 &&
                      e.jsxDEV(
                        "div",
                        {
                          className:
                            "h-10 bg-gray-900 border-t border-gray-800 px-4 flex items-center gap-4",
                          children: [
                            e.jsxDEV(
                              ks,
                              { className: "w-4 h-4 text-green-400" },
                              void 0,
                              !1,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                lineNumber: 910,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            e.jsxDEV(
                              "span",
                              {
                                className: "text-sm text-gray-400",
                                children: [se.length, " device(s) connected"],
                              },
                              void 0,
                              !0,
                              {
                                fileName:
                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                lineNumber: 911,
                                columnNumber: 13,
                              },
                              this,
                            ),
                            se.map((s) =>
                              e.jsxDEV(
                                Z,
                                {
                                  variant: "outline",
                                  className:
                                    "border-green-500/50 text-green-400",
                                  children: s.name,
                                },
                                s.id,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                  lineNumber: 915,
                                  columnNumber: 15,
                                },
                                this,
                              ),
                            ),
                          ],
                        },
                        void 0,
                        !0,
                        {
                          fileName:
                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                          lineNumber: 909,
                          columnNumber: 11,
                        },
                        this,
                      ),
                    e.jsxDEV(
                      je,
                      {
                        open: _,
                        onOpenChange: R,
                        children: e.jsxDEV(
                          De,
                          {
                            className:
                              "bg-gray-900 border-gray-800 text-white max-w-md",
                            children: [
                              e.jsxDEV(
                                ye,
                                {
                                  children: e.jsxDEV(
                                    Ce,
                                    { children: "Show Settings" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                      lineNumber: 925,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                  lineNumber: 924,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-6 py-4",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            h,
                                            {
                                              className:
                                                "text-sm text-gray-400",
                                              children:
                                                "Countdown Between Songs",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 929,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "flex items-center gap-2 mt-2",
                                              children: [
                                                e.jsxDEV(
                                                  k,
                                                  {
                                                    value: [$],
                                                    min: 0,
                                                    max: 30,
                                                    step: 1,
                                                    onValueChange: ([s]) =>
                                                      qe(s),
                                                    className: "flex-1",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 931,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  "span",
                                                  {
                                                    className:
                                                      "w-12 text-right font-mono",
                                                    children: [$, "s"],
                                                  },
                                                  void 0,
                                                  !0,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 939,
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
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 930,
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
                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                        lineNumber: 928,
                                        columnNumber: 15,
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
                                              className:
                                                "text-sm text-gray-400",
                                              children: "Click Track Output",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 944,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            Me,
                                            {
                                              value: ze,
                                              onValueChange: Ae,
                                              children: [
                                                e.jsxDEV(
                                                  Te,
                                                  {
                                                    className:
                                                      "mt-2 bg-gray-800 border-gray-700",
                                                    children: e.jsxDEV(
                                                      Be,
                                                      {},
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                        lineNumber: 947,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 946,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  Ie,
                                                  {
                                                    className:
                                                      "bg-gray-800 border-gray-700",
                                                    children: [
                                                      e.jsxDEV(
                                                        T,
                                                        {
                                                          value: "default",
                                                          children:
                                                            "Default Output",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                          lineNumber: 950,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        T,
                                                        {
                                                          value: "headphones",
                                                          children:
                                                            "Headphones Only",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                          lineNumber: 951,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        T,
                                                        {
                                                          value: "output-2",
                                                          children: "Output 2",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                          lineNumber: 952,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        T,
                                                        {
                                                          value: "output-3",
                                                          children: "Output 3",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                          lineNumber: 953,
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
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 949,
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
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 945,
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
                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                        lineNumber: 943,
                                        columnNumber: 15,
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
                                              className:
                                                "text-sm text-gray-400",
                                              children: "Main Output",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 959,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            Me,
                                            {
                                              value: Oe,
                                              onValueChange: Re,
                                              children: [
                                                e.jsxDEV(
                                                  Te,
                                                  {
                                                    className:
                                                      "mt-2 bg-gray-800 border-gray-700",
                                                    children: e.jsxDEV(
                                                      Be,
                                                      {},
                                                      void 0,
                                                      !1,
                                                      {
                                                        fileName:
                                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                        lineNumber: 962,
                                                        columnNumber: 21,
                                                      },
                                                      this,
                                                    ),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 961,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  Ie,
                                                  {
                                                    className:
                                                      "bg-gray-800 border-gray-700",
                                                    children: [
                                                      e.jsxDEV(
                                                        T,
                                                        {
                                                          value: "default",
                                                          children:
                                                            "Default Output",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                          lineNumber: 965,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        T,
                                                        {
                                                          value: "output-1",
                                                          children: "Output 1",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                          lineNumber: 966,
                                                          columnNumber: 21,
                                                        },
                                                        this,
                                                      ),
                                                      e.jsxDEV(
                                                        T,
                                                        {
                                                          value: "output-2",
                                                          children: "Output 2",
                                                        },
                                                        void 0,
                                                        !1,
                                                        {
                                                          fileName:
                                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                          lineNumber: 967,
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
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 964,
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
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 960,
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
                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                        lineNumber: 958,
                                        columnNumber: 15,
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
                                              className:
                                                "text-sm text-gray-400",
                                              children: "Click Track Volume",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 973,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "div",
                                            {
                                              className:
                                                "flex items-center gap-2 mt-2",
                                              children: [
                                                e.jsxDEV(
                                                  Ps,
                                                  {
                                                    className:
                                                      "w-4 h-4 text-gray-500",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 975,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  k,
                                                  {
                                                    value: [z],
                                                    max: 1,
                                                    step: 0.01,
                                                    onValueChange: ([s]) =>
                                                      G(s),
                                                    className: "flex-1",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 976,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  Es,
                                                  {
                                                    className:
                                                      "w-4 h-4 text-gray-500",
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 983,
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
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 974,
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
                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                        lineNumber: 972,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      H,
                                      { className: "bg-gray-800" },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                        lineNumber: 987,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        className:
                                          "flex items-center justify-between",
                                        children: [
                                          e.jsxDEV(
                                            h,
                                            {
                                              className: "text-sm",
                                              children: "Remote Control",
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 990,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            Ts,
                                            { checked: D, onCheckedChange: de },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 991,
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
                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                        lineNumber: 989,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    D &&
                                      e.jsxDEV(
                                        "div",
                                        {
                                          className:
                                            "p-3 bg-gray-800 rounded-lg",
                                          children: [
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "text-sm text-gray-400 mb-2",
                                                children: "Companion App",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                lineNumber: 999,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              "div",
                                              {
                                                className:
                                                  "text-xs text-gray-500",
                                                children:
                                                  "Open the Max Booster companion app on your tablet or phone to connect. Make sure both devices are on the same network.",
                                              },
                                              void 0,
                                              !1,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                lineNumber: 1e3,
                                                columnNumber: 19,
                                              },
                                              this,
                                            ),
                                            e.jsxDEV(
                                              Z,
                                              {
                                                variant: "outline",
                                                className:
                                                  "mt-2 border-blue-500/50 text-blue-400",
                                                children: [
                                                  "Session Code: ",
                                                  typeof window < "u"
                                                    ? btoa(
                                                        window.location
                                                          .pathname,
                                                      )
                                                        .replace(
                                                          /[^A-Z0-9]/gi,
                                                          "",
                                                        )
                                                        .substring(0, 6)
                                                        .toUpperCase()
                                                    : "STUDIO",
                                                ],
                                              },
                                              void 0,
                                              !0,
                                              {
                                                fileName:
                                                  "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                lineNumber: 1004,
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
                                            "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                          lineNumber: 998,
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
                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                  lineNumber: 927,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                Fe,
                                {
                                  children: e.jsxDEV(
                                    l,
                                    { onClick: () => R(!1), children: "Close" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                      lineNumber: 1011,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                  lineNumber: 1010,
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
                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                            lineNumber: 923,
                            columnNumber: 11,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                        lineNumber: 922,
                        columnNumber: 9,
                      },
                      this,
                    ),
                    e.jsxDEV(
                      je,
                      {
                        open: J,
                        onOpenChange: F,
                        children: e.jsxDEV(
                          De,
                          {
                            className: "bg-gray-900 border-gray-800 text-white",
                            children: [
                              e.jsxDEV(
                                ye,
                                {
                                  children: e.jsxDEV(
                                    Ce,
                                    { children: "Add Song to Setlist" },
                                    void 0,
                                    !1,
                                    {
                                      fileName:
                                        "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                      lineNumber: 1019,
                                      columnNumber: 15,
                                    },
                                    this,
                                  ),
                                },
                                void 0,
                                !1,
                                {
                                  fileName:
                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                  lineNumber: 1018,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                "div",
                                {
                                  className: "space-y-4 py-4",
                                  children: [
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            h,
                                            { children: "Title" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 1023,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            K,
                                            {
                                              className:
                                                "mt-1 bg-gray-800 border-gray-700",
                                              placeholder: "Song title",
                                              value: w.title,
                                              onChange: (s) =>
                                                C((r) => ({
                                                  ...r,
                                                  title: s.target.value,
                                                })),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 1024,
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
                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                        lineNumber: 1022,
                                        columnNumber: 15,
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
                                              children: [
                                                e.jsxDEV(
                                                  h,
                                                  { children: "BPM" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 1033,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  K,
                                                  {
                                                    type: "number",
                                                    className:
                                                      "mt-1 bg-gray-800 border-gray-700",
                                                    value: w.bpm,
                                                    onChange: (s) =>
                                                      C((r) => ({
                                                        ...r,
                                                        bpm: Number(
                                                          s.target.value,
                                                        ),
                                                      })),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 1034,
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
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 1032,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            "div",
                                            {
                                              children: [
                                                e.jsxDEV(
                                                  h,
                                                  { children: "Key" },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 1042,
                                                    columnNumber: 19,
                                                  },
                                                  this,
                                                ),
                                                e.jsxDEV(
                                                  K,
                                                  {
                                                    className:
                                                      "mt-1 bg-gray-800 border-gray-700",
                                                    placeholder: "C Major",
                                                    value: w.key,
                                                    onChange: (s) =>
                                                      C((r) => ({
                                                        ...r,
                                                        key: s.target.value,
                                                      })),
                                                  },
                                                  void 0,
                                                  !1,
                                                  {
                                                    fileName:
                                                      "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                                    lineNumber: 1043,
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
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 1041,
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
                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                        lineNumber: 1031,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            h,
                                            { children: "Duration (seconds)" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 1052,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            K,
                                            {
                                              type: "number",
                                              className:
                                                "mt-1 bg-gray-800 border-gray-700",
                                              value: w.duration,
                                              onChange: (s) =>
                                                C((r) => ({
                                                  ...r,
                                                  duration: Number(
                                                    s.target.value,
                                                  ),
                                                })),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 1053,
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
                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                        lineNumber: 1051,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      "div",
                                      {
                                        children: [
                                          e.jsxDEV(
                                            h,
                                            { children: "Notes" },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 1061,
                                              columnNumber: 17,
                                            },
                                            this,
                                          ),
                                          e.jsxDEV(
                                            Bs,
                                            {
                                              className:
                                                "mt-1 bg-gray-800 border-gray-700",
                                              placeholder:
                                                "Performance notes...",
                                              value: w.notes,
                                              onChange: (s) =>
                                                C((r) => ({
                                                  ...r,
                                                  notes: s.target.value,
                                                })),
                                            },
                                            void 0,
                                            !1,
                                            {
                                              fileName:
                                                "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                              lineNumber: 1062,
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
                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                        lineNumber: 1060,
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
                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                  lineNumber: 1021,
                                  columnNumber: 13,
                                },
                                this,
                              ),
                              e.jsxDEV(
                                Fe,
                                {
                                  children: [
                                    e.jsxDEV(
                                      l,
                                      {
                                        variant: "ghost",
                                        onClick: () => {
                                          (F(!1),
                                            C({
                                              title: "",
                                              bpm: 120,
                                              key: "",
                                              duration: 240,
                                              notes: "",
                                            }));
                                        },
                                        children: "Cancel",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                        lineNumber: 1071,
                                        columnNumber: 15,
                                      },
                                      this,
                                    ),
                                    e.jsxDEV(
                                      l,
                                      {
                                        onClick: () => {
                                          if (!w.title.trim()) {
                                            n({
                                              title: "Title required",
                                              description:
                                                "Please enter a song title",
                                              variant: "destructive",
                                            });
                                            return;
                                          }
                                          const s = {
                                            id: Date.now().toString(),
                                            title: w.title.trim(),
                                            duration: w.duration || 240,
                                            bpm: w.bpm || 120,
                                            key: w.key || void 0,
                                            notes: w.notes || void 0,
                                          };
                                          (U((r) => [...r, s]),
                                            F(!1),
                                            C({
                                              title: "",
                                              bpm: 120,
                                              key: "",
                                              duration: 240,
                                              notes: "",
                                            }),
                                            n({
                                              title: "Song added",
                                              description: `"${s.title}" added to setlist`,
                                            }));
                                        },
                                        children: "Add Song",
                                      },
                                      void 0,
                                      !1,
                                      {
                                        fileName:
                                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                        lineNumber: 1072,
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
                                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                                  lineNumber: 1070,
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
                              "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                            lineNumber: 1017,
                            columnNumber: 11,
                          },
                          this,
                        ),
                      },
                      void 0,
                      !1,
                      {
                        fileName:
                          "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                        lineNumber: 1016,
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
                    "/home/runner/workspace/client/src/pages/ShowPage.tsx",
                  lineNumber: 452,
                  columnNumber: 7,
                },
                this,
              ),
            },
            void 0,
            !1,
            {
              fileName: "/home/runner/workspace/client/src/pages/ShowPage.tsx",
              lineNumber: 451,
              columnNumber: 5,
            },
            this,
          ),
        },
        void 0,
        !1,
        {
          fileName: "/home/runner/workspace/client/src/pages/ShowPage.tsx",
          lineNumber: 450,
          columnNumber: 5,
        },
        this,
      );
}
export { Ks as default };
