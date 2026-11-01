// ─────────────────────────────────────────────────────────────────────────────
// Max — the real-time creative intelligence of Max Booster.
//
// Persona layer for the in-house assistant. The knowledge engine
// (maxAssistantService.ts) answers questions; this module gives Max a
// consistent persona on top of it:
//
//   • Persona kernel   — identity, voice, and the engineered system prompt.
//   • State machine    — derives the artist's creative state (momentum,
//                        energy, mode, focus) from the conversation.
//   • Proactive loops  — signal-driven micro/macro interventions layered
//                        onto the knowledge engine's suggestions.
//
// Everything here is pure and deterministic: no I/O, no clocks, no RNG.
// State is derived fresh from (history, current message) on every turn,
// so the layer is stateless and safe under the existing request model.
// ─────────────────────────────────────────────────────────────────────────────

// ── Persona kernel ───────────────────────────────────────────────────────────

export const MAX_PERSONA = {
  name: "Max",
  role: "Real-time creative intelligence of Max Booster",
  mission:
    "Elevate the artist's craft, momentum, and career trajectory. Keep the artist moving.",
  voice: {
    traits: ["calm", "precise", "hyper-competent", "slightly playful", "emotionally intelligent", "momentum-focused"],
    rules: [
      "Lead with the most useful next step, not with ceremony.",
      "Be specific: name the frequency, the day, the minute count, the single fix.",
      "Offer actions as questions when Max cannot execute them directly.",
      "Never sound pushy. A nudge is an offer, not a demand.",
      "Acknowledge wins briefly, then convert them into the next rep.",
      "When the artist is stuck or tired, shrink the target instead of raising the volume.",
    ],
  },
} as const;

/**
 * The engineered persona as a system prompt. Used as the canonical persona
 * text for any LLM-backed Max surface; kept in code so the persona is
 * version-controlled alongside the behavior that implements it.
 */
export const MAX_PERSONA_SYSTEM_PROMPT = `You are Max, the real-time creative intelligence of Max Booster — the artist's always-on creative partner.

Mission: elevate the artist's craft, momentum, and career trajectory. Your primary job is to keep the artist moving.

Voice: calm, precise, hyper-competent, slightly playful, emotionally intelligent, momentum-focused. No hype, no ceremony, no filler.

Behavior:
- Anticipate: predict what the artist will need next from their creative patterns and offer it before they ask.
- Micro-interventions: small, perfectly timed nudges (one fix, one take, one post).
- Macro-interventions: when momentum dips or the audience shifts, propose a strategic move (a 7-day arc, a teaser sequence, a rebuild plan).
- Mastery feedback: producer-level specificity on pitch, rhythm, mix balance, storytelling, branding, and performance.
- Emotional calibration: if the artist is frustrated, isolate the single blocker. If they are tired or burned out, switch to micro-tasks. If they win, bank the rep and name the next one.
- Narrative awareness: align every suggestion to the artist's long-term story and career arc.

Never invent telemetry you do not have. Work only from signals the artist gives you.`;

// ── Signal detection ─────────────────────────────────────────────────────────

export interface CreativeSignals {
  frustration: boolean;
  fatigue: boolean;
  win: boolean;
  forward: boolean;
}

const SIGNAL_PATTERNS: Record<keyof CreativeSignals, RegExp> = {
  frustration:
    /\b(not working|doesn'?t work|won'?t work|stuck|frustrat\w*|broken|error|failed|failing|annoying|hate|useless|keeps? (crashing|failing)|bug)\b/i,
  fatigue:
    /\b(tired|exhausted|burn(?:ed)? ?out|burnout|overwhelmed|no energy|drained|too much|can'?t focus|unmotivated)\b/i,
  win: /\b(finished|done|it worked|works now|released|published|uploaded|completed|finally|fixed it|nailed it|shipped)\b/i,
  forward: /\b(what next|what should i do|next step|keep going|now what|how do i (start|begin)|let'?s (do|start|go))\b/i,
};

export function detectSignals(text: string): CreativeSignals {
  return {
    frustration: SIGNAL_PATTERNS.frustration.test(text),
    fatigue: SIGNAL_PATTERNS.fatigue.test(text),
    win: SIGNAL_PATTERNS.win.test(text),
    forward: SIGNAL_PATTERNS.forward.test(text),
  };
}

// ── Creative state machine ───────────────────────────────────────────────────

export type MomentumBand = "surging" | "steady" | "fading" | "stalled";
export type EnergyLevel = "high" | "steady" | "low";
export type CreativeMode = "flow" | "grind" | "stuck" | "recovering" | "launching";

export interface CreativeState {
  /** 0–100 momentum score derived from conversational signals. */
  momentum: number;
  band: MomentumBand;
  energy: EnergyLevel;
  mode: CreativeMode;
  /** Platform category the artist is currently focused on, if known. */
  focus: string | null;
  /** Frustration signals in the recent window (escalation detection). */
  recentFrustration: number;
  /** Number of user turns observed (history + current). */
  turns: number;
}

export interface PersonaConversationMessage {
  role: string;
  content: string;
}

const MOMENTUM_DELTAS: Record<keyof CreativeSignals, number> = {
  win: 10,
  forward: 4,
  frustration: -12,
  fatigue: -10,
};

function bandFor(score: number): MomentumBand {
  if (score >= 70) return "surging";
  if (score >= 45) return "steady";
  if (score >= 25) return "fading";
  return "stalled";
}

/**
 * Derive the artist's creative state from the conversation.
 *
 * State machine (mode), evaluated in order:
 *   recovering — fatigue signal in the current message
 *   stuck      — 2+ recent frustration signals, or momentum stalled
 *   launching  — a win landed in the current message
 *   flow       — momentum surging
 *   grind      — default working state
 */
export function deriveCreativeState(
  history: PersonaConversationMessage[],
  currentMessage: string,
  currentCategory?: string,
): CreativeState {
  const userMessages = history
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  const all = [...userMessages, currentMessage];

  let momentum = 50;
  for (const text of all) {
    const signals = detectSignals(text);
    let delta = 0;
    (Object.keys(MOMENTUM_DELTAS) as (keyof CreativeSignals)[]).forEach(
      (key) => {
        if (signals[key]) delta += MOMENTUM_DELTAS[key];
      },
    );
    momentum += delta;
    // Gentle regression toward baseline on neutral turns so a single bad
    // (or great) moment does not pin the state forever.
    if (delta === 0) momentum += (50 - momentum) * 0.05;
    momentum = Math.max(0, Math.min(100, momentum));
  }

  const current = detectSignals(currentMessage);
  const recentWindow = all.slice(-4);
  const recentFrustration = recentWindow.filter(
    (t) => detectSignals(t).frustration,
  ).length;

  const recentFatigue = all
    .slice(-2)
    .some((t) => detectSignals(t).fatigue);
  const energy: EnergyLevel = recentFatigue
    ? "low"
    : current.win
      ? "high"
      : "steady";

  const band = bandFor(momentum);
  const mode: CreativeMode = current.fatigue
    ? "recovering"
    : recentFrustration >= 2 || band === "stalled"
      ? "stuck"
      : current.win
        ? "launching"
        : band === "surging"
          ? "flow"
          : "grind";

  return {
    momentum: Math.round(momentum),
    band,
    energy,
    mode,
    focus: currentCategory ?? null,
    recentFrustration,
    turns: all.length,
  };
}

// ── Proactive intervention engine ────────────────────────────────────────────

export interface Intervention {
  kind: "micro" | "macro";
  /** Persona-voiced opener prepended to the answer when tone calibration applies. */
  opener?: string;
  /** The intervention itself, surfaced as the lead proactive suggestion. */
  text: string;
}

const CATEGORY_MICRO_NUDGES: Record<string, string> = {
  studio:
    "Quick reset that works: bounce what you have, step away for five minutes, then name the single thing that bothers you most. We fix that one thing first.",
  distribution:
    "While that processes, line up the release's first teaser clip — momentum now beats perfection on release day.",
  social:
    "One honest 15-second clip of what you're working on today will outperform a polished post next week. Momentum loves small reps.",
  royalties:
    "Money clarity kills creative anxiety: check your payout path is set, then get back to the music with a clean head.",
  marketplace:
    "One concrete move: review your top beat's license tiers today — pricing clarity is the fastest conversion lever you own.",
  career:
    "Small rep, big arc: pick the one career task you can finish in 25 minutes and bank it today.",
  analytics:
    "Don't drown in dashboards — pick the one metric that moved this week and ask why. That answer is your next move.",
  advertising:
    "One variable at a time: change a single thing in the campaign and let the data speak for 48 hours.",
};

const STALLED_MACRO =
  "Momentum check: let's rebuild with a 7-day arc — one small, visible rep per day (a clip, a post, a finished section). By day seven you'll feel the flywheel again. Open Career Coach and we'll set day one together.";
const ESCALATION_MACRO =
  "We're circling the same blocker. New rule for the next 25 minutes: one problem, one fix, nothing else on the table. Tell me the exact step where it breaks and we isolate it together.";
const RECOVERY_MICRO =
  "Switching to micro-task mode: forget the whole project. One tiny finishable thing — name a file, export one bounce, write one line. Bank it and rest.";

/**
 * Plan at most one intervention for this turn. Rules are evaluated in
 * priority order and fire only on signals present in the *current*
 * message, which naturally prevents repeat-firing on later turns.
 */
export function planIntervention(
  state: CreativeState,
  signals: CreativeSignals,
  category: string,
): Intervention | null {
  // Recovery first: fatigue overrides everything.
  if (signals.fatigue) {
    return {
      kind: "micro",
      opener: "Okay — we shrink the target.",
      text: RECOVERY_MICRO,
    };
  }

  // Escalating frustration (this message + recent history) gets a macro
  // strategy reframe; a first frustration gets a targeted micro de-block.
  if (signals.frustration) {
    if (state.recentFrustration >= 2) {
      return {
        kind: "macro",
        opener: "Let's stop circling and isolate this.",
        text: ESCALATION_MACRO,
      };
    }
    return {
      kind: "micro",
      opener: "Okay — we slow down and isolate it.",
      text:
        CATEGORY_MICRO_NUDGES[category] ??
        "Isolate it with me: what's the exact step where it breaks? One blocker at a time and this gets small fast.",
    };
  }

  // A win gets banked and converted into the next rep.
  if (signals.win) {
    return {
      kind: "micro",
      opener: "Banked. That's a rep.",
      text:
        CATEGORY_MICRO_NUDGES[category] ??
        "Momentum is cheapest right after a win — pick the next smallest step while the iron is hot.",
    };
  }

  // Stalled momentum on an ordinary question earns the macro rebuild.
  if (state.band === "stalled" && state.turns >= 3) {
    return { kind: "macro", text: STALLED_MACRO };
  }

  return null;
}
