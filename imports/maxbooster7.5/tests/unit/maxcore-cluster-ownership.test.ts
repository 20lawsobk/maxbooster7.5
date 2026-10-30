import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("MaxCore cluster ownership", () => {
  const originalEnv = process.env;
  const originalSend = Object.getOwnPropertyDescriptor(process, "send");
  let priorMessageListeners: Function[] = [];
  let priorDisconnectListeners: Function[] = [];

  beforeEach(() => {
    vi.resetModules();
    priorMessageListeners = process.listeners("message");
    priorDisconnectListeners = process.listeners("disconnect");
    process.env = {
      ...originalEnv,
      MAXCORE_LOCAL: "1",
      SESSION_SECRET: "test-secret-test-secret-test-secret-1234",
    };
  });

  afterEach(() => {
    for (const listener of process.listeners("message")) {
      if (!priorMessageListeners.includes(listener)) {
        process.removeListener("message", listener);
      }
    }
    for (const listener of process.listeners("disconnect")) {
      if (!priorDisconnectListeners.includes(listener)) {
        process.removeListener("disconnect", listener);
      }
    }
    if (originalSend) {
      Object.defineProperty(process, "send", originalSend);
    } else {
      delete (process as NodeJS.Process & { send?: unknown }).send;
    }
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("selects exactly the primary/standalone process as owner", async () => {
    const { isMaxcoreSupervisorOwner } = await import(
      "../../server/services/maxcoreLocalSupervisor.js"
    );
    const roles = [
      {},
      { CLUSTER_WORKER_ID: "0" },
      { CLUSTER_WORKER_ID: "1" },
      { CLUSTER_WORKER_ID: "2" },
    ];
    expect(roles.filter((env) => isMaxcoreSupervisorOwner(env)).length).toBe(1);
  });

  it("workers use primary IPC, never spawn or probe an arbitrary loopback process", async () => {
    process.env.CLUSTER_WORKER_ID = "1";
    const spawn = vi.fn();
    vi.doMock("node:child_process", () => ({ spawn }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const killMock = vi.spyOn(process, "kill").mockImplementation(() => true);
    Object.defineProperty(process, "send", {
      configurable: true,
      value: vi.fn((message: { requestId: number }) => {
        queueMicrotask(() => {
          process.emit("message", {
            type: "MAXCORE_AUTHORITY_STATUS",
            requestId: message.requestId,
            ready: true,
            status: {
              enabled: true,
              running: true,
              ready: true,
              pid: 4321,
              restarts: 0,
              lastExit: null,
              error: null,
            },
          });
        });
      }),
    });

    const supervisor = await import(
      "../../server/services/maxcoreLocalSupervisor.js"
    );
    await supervisor.startMaxcoreLocal();
    expect(await supervisor.checkMaxcoreLocalReady()).toBe(true);
    expect(supervisor.getMaxcoreLocalStatus().pid).toBe(4321);
    expect(spawn).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    supervisor.stopMaxcoreLocal();
    expect(await supervisor.checkMaxcoreLocalReady()).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
    expect(killMock).not.toHaveBeenCalled();
  });

  it("invalidates worker readiness when the primary authority disconnects", async () => {
    process.env.CLUSTER_WORKER_ID = "0";
    Object.defineProperty(process, "send", {
      configurable: true,
      value: vi.fn((message: { requestId: number }) => {
        queueMicrotask(() => {
          process.emit("message", {
            type: "MAXCORE_AUTHORITY_STATUS",
            requestId: message.requestId,
            ready: true,
            status: {
              enabled: true,
              running: true,
              ready: true,
              pid: 9876,
              restarts: 0,
              lastExit: null,
              error: null,
            },
          });
        });
      }),
    });
    const supervisor = await import(
      "../../server/services/maxcoreLocalSupervisor.js"
    );
    await supervisor.startMaxcoreLocal();
    expect(await supervisor.checkMaxcoreLocalReady()).toBe(true);

    process.emit("disconnect");

    expect(await supervisor.checkMaxcoreLocalReady()).toBe(false);
    expect(supervisor.getMaxcoreLocalStatus()).toMatchObject({
      running: false,
      ready: false,
      pid: null,
      error: "MaxCore authority IPC disconnected",
    });
  });
});