import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const html = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");
const startup = readFileSync(resolve(process.cwd(), "client/public/js/startup.js"), "utf8");

describe("initial loading screen", () => {
  it("keeps the splash outside React and uses an honest indeterminate progress bar", () => {
    expect(html).toMatch(/<div id="root"><\/div>\s*<!-- Initial overlay is outside React's root/);
    expect(html).toMatch(/animation: mb-loader-progress/);
    expect(html).toMatch(/#mb-initial-loader\.mb-loader-exit/);
    expect(startup).not.toMatch(/setProgress\(/);
    expect(startup).toContain("loader.classList.add(\"mb-loader-exit\")");
  });

  it("fades and removes the splash only after the app root renders", () => {
    const listeners = new Map<string, Function>();
    const classes = new Set<string>();
    let removed = false;
    let reloadHandler: (() => void) | undefined;
    let observerCallback: (() => void) | undefined;
    let observerDisconnected = false;
    let errorHandler: ((event: { message: string }) => void) | undefined;
    const appendErrorOverlay = vi.fn();
    const msg = { textContent: "Loading Max Booster..." };
    const sub = { textContent: "" };
    const button = {
      style: { display: "none" },
      addEventListener: (_name: string, callback: () => void) => {
        reloadHandler = callback;
      },
    };
    const loader = {
      parentNode: {
        removeChild() {
          removed = true;
          loader.parentNode = null;
        },
      } as { removeChild: () => void } | null,
      classList: { add: (name: string) => classes.add(name) },
      setAttribute: vi.fn(),
      addEventListener: (name: string, callback: Function) => listeners.set(name, callback),
    };
    const root = {
      children: [] as unknown[],
      firstElementChild: null as { id: string } | null,
      hasSuspenseFallback: true,
      querySelector(selector: string) {
        return selector === '[role="status"][aria-label="Loading application"]' &&
          this.hasSuspenseFallback ? {} : null;
      },
    };
    const document = {
      getElementById(id: string) {
        return id === "root" ? root
          : id === "mb-initial-loader" ? loader
            : id === "mb-loader-msg" ? msg
              : id === "mb-loader-sub" ? sub
                : id === "mb-loader-reload" ? button
                  : null;
      },
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, textContent: "" }),
      body: { appendChild: appendErrorOverlay },
    };
    class TestMutationObserver {
      constructor(callback: () => void) {
        observerCallback = callback;
      }
      observe() {}
      disconnect() {
        observerDisconnected = true;
      }
    }
    const location = { reload: vi.fn() };
    const timers: Array<{ callback: () => void; delay: number }> = [];
    const consoleLog = vi.fn();
    new Function(
      "window",
      "document",
      "navigator",
      "MutationObserver",
      "setTimeout",
      "location",
      "console",
      startup,
    )(
      {
        __MB_BOOT: Date.now(),
        addEventListener(name: string, callback: (event: { message: string }) => void) {
          if (name === "error") errorHandler = callback;
        },
      },
      document,
      { userAgent: "test" },
      TestMutationObserver,
      (callback: () => void, delay: number) => {
        timers.push({ callback, delay });
        return timers.length;
      },
      location,
      { log: consoleLog },
    );

    expect(removed).toBe(false);
    timers.find(timer => timer.delay === 20000)?.callback();
    expect(button.style.display).toBe("inline-block");
    expect(msg.textContent).toBe("The app has not appeared yet.");
    reloadHandler?.();
    expect(location.reload).toHaveBeenCalledOnce();

    root.firstElementChild = { id: "main-content" };
    root.children = [root.firstElementChild];
    observerCallback?.();
    expect(removed).toBe(false);
    expect(observerDisconnected).toBe(false);

    root.hasSuspenseFallback = false;
    observerCallback?.();

    expect(observerDisconnected).toBe(true);
    expect(classes.has("mb-loader-exit")).toBe(true);
    expect(loader.setAttribute).toHaveBeenCalledWith("aria-hidden", "true");
    expect(removed).toBe(false);
    listeners.get("transitionend")?.();
    expect(removed).toBe(true);
    errorHandler?.({ message: "Late async error" });
    expect(appendErrorOverlay).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith(expect.stringMatching(/App rendered in \d+ ms/));
  });
});
