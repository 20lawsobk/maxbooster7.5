import { describe, expect, it, vi } from "vitest";
import {
  APPLICATION_DATABASE_SESSION_SQL,
  configureApplicationDatabaseSession,
} from "../../server/lib/databaseSession.js";
import { assertWorkerSchema } from "../../server/lib/readinessWorkerLifecycle.js";

describe("application database session", () => {
  it("sets the app schema and bounded statement timeout in one ordered query", async () => {
    const query = vi.fn().mockResolvedValue({});
    await configureApplicationDatabaseSession({ query });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      "SELECT set_config('search_path', 'public', false), set_config('statement_timeout', '30s', false)",
    );
    expect(APPLICATION_DATABASE_SESSION_SQL).toBe(query.mock.calls[0][0]);
  });

  it("propagates session initialization failures instead of masking them", async () => {
    const query = vi.fn().mockRejectedValue(new Error("database unavailable"));
    await expect(configureApplicationDatabaseSession({ query })).rejects.toThrow(
      "database unavailable",
    );
  });
});

describe("worker database schema gate", () => {
  it("probes public relations and rejects a non-public query session", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ current_schema: "maxcore", missing_relations: null }],
    });
    await expect(assertWorkerSchema(query, false, false)).rejects.toThrow(
      "Application database session must resolve public first",
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("fails with the complete missing public relation list before workers start", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        current_schema: "public",
        missing_relations: ["integration_catalog_jobs", "storefront_hosts"],
      }],
    });
    await expect(assertWorkerSchema(query, false, false)).rejects.toThrow(
      "integration_catalog_jobs, storefront_hosts",
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("checks the durable worker schema before optional backup and fan mail tables", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ current_schema: "public", missing_relations: null }] })
      .mockResolvedValue({});
    await assertWorkerSchema(query, true, true);
    expect(query).toHaveBeenCalledTimes(8);
    expect(query.mock.calls[0][0]).toContain("to_regclass('public.' || required.name)");
    expect(query.mock.calls[1][0]).toContain("FROM public.integration_catalog_jobs");
    expect(query.mock.calls[2][0]).toContain("FROM public.runtime_backup_catalog");
    expect(query.mock.calls[3][0]).toContain("FROM public.runtime_backup_runs");
    expect(query.mock.calls[4][0]).toContain("FROM public.growth_fan_commands");
    expect(query.mock.calls[5][0]).toContain("FROM public.growth_fan_recipients");
    expect(query.mock.calls[6][0]).toContain("FROM public.growth_fan_permissions");
    expect(query.mock.calls[7][0]).toContain("FROM public.growth_fan_provider_events");
  });
});
