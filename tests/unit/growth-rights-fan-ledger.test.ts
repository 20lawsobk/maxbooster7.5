import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  recipients: [] as any[], permitted: true, failReceiptWrite: false,
  send: vi.fn(), claims: 0,
}));
vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({ text: strings.join("?"), values }),
}));
vi.mock("../../server/services/fanMailAdapter", () => ({ sendTransactionalNoRetry: state.send }));
vi.mock("../../server/db", () => {
  const execute = async ({ text, values: v }: any) => {
    if (text.includes("SELECT * FROM growth_fan_commands"))
      return { rows: [{ id: "command", artist_id: "artist", subject: "News", body: "Hello <fan>" }] };
    if (text.includes("SELECT r.*")) return { rows: state.recipients.filter(r => r.state === "pending").slice(0, 1) };
    if (text.includes("SELECT state FROM growth_fan_permissions"))
      return { rows: [{ state: state.permitted ? "consented" : "suppressed" }] };
    if (text.includes("SET state=") && text.includes("attempted_at")) {
      const recipient = state.recipients.find(r => r.email === v[2]);
      recipient.state = v[0]; state.claims++;
    }
    if (text.includes("SET state=") && text.includes("completed_at")) {
      if (state.failReceiptWrite) throw new Error("database unavailable after provider acceptance");
      const recipient = state.recipients.find(r => r.email === v[4]);
      recipient.state = v[0]; recipient.providerMessageId = v[1];
    }
    if (text.includes("SELECT r.state,count(*)")) {
      const counts = new Map<string, number>();
      state.recipients.forEach(r => counts.set(r.state, (counts.get(r.state) ?? 0) + 1));
      return { rows: [...counts].map(([state, count]) => ({ state, count })) };
    }
    return { rows: [] };
  };
  return { db: { execute, transaction: (fn: any) => fn({ execute }) } };
});
import { processFanDelivery } from "../../server/services/fanDeliveryService";
beforeEach(() => {
  process.env.APP_URL = "https://example.test";
  state.permitted = true; state.failReceiptWrite = false; state.claims = 0;
  state.recipients = ["a", "b"].map(name => ({
    email: `${name}@example.test`, state: "pending", unsubscribe_token: name.repeat(64),
  }));
  state.send.mockReset().mockImplementation(async () => {
    expect(state.claims).toBeGreaterThan(0);
    return { status: "accepted", provider: "resend", providerMessageId: "receipt" };
  });
});
describe("fan ledger external-effect boundaries (mock database)", () => {
  it("records real acceptance and resumes only remaining pending recipients", async () => {
    const first = await processFanDelivery("command", "artist", 1);
    expect(first).toMatchObject({ acceptedCount: 1, pendingCount: 1, deliveredCount: 0 });
    const second = await processFanDelivery("command", "artist");
    expect(second).toMatchObject({ acceptedCount: 2, pendingCount: 0 });
    await processFanDelivery("command", "artist");
    expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.send.mock.calls[0][0].html).toContain("Unsubscribe");
    expect(state.send.mock.calls[0][0].html).toContain("&lt;fan&gt;");
  });
  it("suppresses recipients who withdraw before claim", async () => {
    state.permitted = false;
    expect(await processFanDelivery("command", "artist")).toMatchObject({ suppressedCount: 2, acceptedCount: 0 });
    expect(state.send).not.toHaveBeenCalled();
  });
  it("never replays accepted-but-unrecorded claims", async () => {
    state.failReceiptWrite = true;
    await expect(processFanDelivery("command", "artist", 1)).rejects.toThrow("database unavailable");
    expect(state.recipients[0].state).toBe("sending");
    state.failReceiptWrite = false;
    const result = await processFanDelivery("command", "artist");
    expect(result).toMatchObject({ unknownCount: 1, acceptedCount: 1 });
    expect(state.send).toHaveBeenCalledTimes(2);
  });
  it("quarantines ambiguous failures without whole-audience retries", async () => {
    state.send.mockResolvedValueOnce({ status: "unknown", reason: "timeout" });
    expect(await processFanDelivery("command", "artist")).toMatchObject({ unknownCount: 1, acceptedCount: 1 });
    await processFanDelivery("command", "artist");
    expect(state.send).toHaveBeenCalledTimes(2);
  });
});