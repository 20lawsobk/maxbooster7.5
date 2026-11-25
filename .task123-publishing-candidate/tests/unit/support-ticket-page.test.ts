import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function harness() {
  const source = readFileSync("client/src/pages/SupportTicket.tsx", "utf8");
  const slots: any[] = []; let cursor = 0; let effect: (() => (() => void)) | undefined;
  let request: (...args: any[]) => Promise<any> = async () => ({json: async () => ({id: "one", subject: "First", status: "open", messages: []})});
  const calls: any[][] = [];
  const hooks = {
    useState(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value: any) => {slots[index] = value;}]; },
    useRef(initial: unknown) {const index = cursor++; if (!(index in slots)) slots[index] = {current: initial}; return slots[index];},
    useCallback: (fn: any) => fn,
    useEffect: (fn: any) => {effect = fn;},
  };
  const jsx = (type: any, props: any) => ({type, props});
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(source + "\nexport { TicketConversation };", {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText, {
    exports, AbortController, AbortSignal, Error,
    require(id: string) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime") return {jsx, jsxs: jsx, Fragment: "Fragment"};
      if (id.endsWith("/queryClient")) return {apiRequest: (...args: any[]) => {calls.push(args); return request(...args);}};
      return new Proxy({}, {get: (_, name) => name});
    },
  });
  function render(id = "one") {cursor = 0; return exports.TicketConversation({ticketId: id});}
  function nodes(node: any): any[] {if (!node || typeof node !== "object") return []; return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];}
  const find = (tree: any, type: string) => nodes(tree).find(node => node.type === type);
  return {render, find, calls, setRequest: (fn: typeof request) => {request = fn;}, mount: () => effect!(), slots};
}
const flush = async () => {await new Promise(resolve => setImmediate(resolve));};

describe("customer support page request lifecycle", () => {
  it("does not publish a late response after ticket cleanup", async () => {
    const h = harness(); let resolve: (value: any) => void = () => {};
    h.setRequest(() => new Promise(done => {resolve = done;}));
    h.render(); const cleanup = h.mount(); cleanup();
    resolve({json: async () => ({id: "old", subject: "Stale", messages: []})});
    await flush();
    expect(h.slots[0]).toBeNull();
  });
  it("sends one bounded CSRF-aware request for duplicate same-tick clicks", async () => {
    const h = harness(); h.render(); const cleanup = h.mount(); await flush();
    let tree = h.render(); h.find(tree, "Textarea").props.onChange({target: {value: " Hello "}});
    tree = h.render();
    let resolve: (value: any) => void = () => {};
    h.setRequest(() => new Promise(done => {resolve = done;}));
    const click = h.find(tree, "Button").props.onClick;
    const first = click(); const second = click();
    expect(h.calls.filter(args => args[0] === "POST")).toHaveLength(1);
    expect(h.calls.at(-1)).toEqual(["POST", "/api/support/my/tickets/one/messages", {message: "Hello"}, {timeout: 30000}]);
    cleanup(); resolve({}); await Promise.all([first, second]);
  });
});
