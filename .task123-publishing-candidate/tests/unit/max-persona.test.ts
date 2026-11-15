import { describe, it, expect } from "vitest";
import {
  MAX_PERSONA,
  MAX_PERSONA_SYSTEM_PROMPT,
  detectSignals,
  deriveCreativeState,
  planIntervention,
} from "../../server/services/maxPersona.js";
import { generateMaxResponse } from "../../server/services/maxAssistantService.js";

const user = (content: string) => ({ role: "user", content });

describe("Max persona kernel", () => {
  it("carries the engineered identity and voice", () => {
    expect(MAX_PERSONA.name).toBe("Max");
    expect(MAX_PERSONA.voice.traits).toContain("momentum-focused");
    expect(MAX_PERSONA_SYSTEM_PROMPT).toContain("keep the artist moving");
    expect(MAX_PERSONA_SYSTEM_PROMPT).toContain("Never invent telemetry");
  });
});

describe("signal detection", () => {
  it("detects frustration, fatigue, wins, and forward intent", () => {
    expect(detectSignals("the export is not working").frustration).toBe(true);
    expect(detectSignals("I'm exhausted and overwhelmed").fatigue).toBe(true);
    expect(detectSignals("finally finished my track").win).toBe(true);
    expect(detectSignals("what should I do next?").forward).toBe(true);
    expect(detectSignals("how do royalties work?")).toEqual({
      frustration: false,
      fatigue: false,
      win: false,
      forward: false,
    });
  });
});

describe("creative state machine", () => {
  it("banks momentum on wins and enters launching mode", () => {
    const state = deriveCreativeState([], "finally finished it, it worked!");
    expect(state.momentum).toBeGreaterThan(50);
    expect(state.mode).toBe("launching");
    expect(state.energy).toBe("high");
  });

  it("drops momentum and enters stuck mode under repeated frustration", () => {
    const history = [user("this is broken"), user("still not working")];
    const state = deriveCreativeState(history, "it failed again");
    expect(state.band).toBe("stalled");
    expect(state.mode).toBe("stuck");
    expect(state.recentFrustration).toBe(3);
  });

  it("enters recovering mode with low energy on fatigue", () => {
    const state = deriveCreativeState([], "I'm burned out and tired");
    expect(state.mode).toBe("recovering");
    expect(state.energy).toBe("low");
  });

  it("reaches flow when momentum surges across wins", () => {
    const history = [
      user("released my single"),
      user("uploaded the video, it worked"),
    ];
    const state = deriveCreativeState(history, "what next?");
    expect(state.band).toBe("surging");
    expect(state.mode).toBe("flow");
  });
});

describe("proactive intervention engine", () => {
  it("shrinks the target on fatigue", () => {
    const msg = "I'm exhausted, too much on my plate";
    const state = deriveCreativeState([], msg);
    const intervention = planIntervention(state, detectSignals(msg), "studio");
    expect(intervention?.kind).toBe("micro");
    expect(intervention?.opener).toContain("shrink the target");
    expect(intervention?.text).toContain("micro-task");
  });

  it("de-blocks a first frustration with a category micro-nudge", () => {
    const msg = "the mix export is not working";
    const state = deriveCreativeState([], msg);
    const intervention = planIntervention(state, detectSignals(msg), "studio");
    expect(intervention?.kind).toBe("micro");
    expect(intervention?.text).toContain("single thing");
  });

  it("escalates to a macro reframe when frustration repeats", () => {
    const history = [user("this is broken"), user("still not working")];
    const msg = "it failed again";
    const state = deriveCreativeState(history, msg);
    const intervention = planIntervention(state, detectSignals(msg), "studio");
    expect(intervention?.kind).toBe("macro");
    expect(intervention?.text).toContain("25 minutes");
  });

  it("rebuilds with a 7-day arc when momentum has stalled", () => {
    const history = [
      user("this is broken"),
      user("still not working"),
      user("it failed again"),
    ];
    const msg = "how do I export stems?";
    const state = deriveCreativeState(history, msg);
    const intervention = planIntervention(state, detectSignals(msg), "studio");
    expect(intervention?.kind).toBe("macro");
    expect(intervention?.text).toContain("7-day arc");
  });

  it("converts a win into the next rep", () => {
    const msg = "just released my new single";
    const state = deriveCreativeState([], msg);
    const intervention = planIntervention(
      state,
      detectSignals(msg),
      "distribution",
    );
    expect(intervention?.kind).toBe("micro");
    expect(intervention?.opener).toContain("Banked");
  });

  it("stays quiet on a plain question with healthy momentum", () => {
    const msg = "how do royalties work?";
    const state = deriveCreativeState([], msg);
    expect(planIntervention(state, detectSignals(msg), "royalties")).toBeNull();
  });
});

describe("persona layer wired into generateMaxResponse", () => {
  it("calibrates tone and leads suggestions with the intervention", () => {
    const res = generateMaxResponse(
      "I'm so frustrated, the export is not working",
      [],
    );
    expect(res.content.startsWith("Okay — we slow down and isolate it.")).toBe(
      true,
    );
    expect(res.proactiveSuggestions?.length).toBeGreaterThan(0);
    expect(res.personaState?.band).toBe("fading");
  });

  it("leaves plain questions untouched apart from persona state", () => {
    const res = generateMaxResponse("How do I distribute my music?", []);
    expect(res.content.startsWith("Okay —")).toBe(false);
    expect(res.personaState?.mode).toBe("grind");
    expect(res.category).toBe("distribution");
  });
});
