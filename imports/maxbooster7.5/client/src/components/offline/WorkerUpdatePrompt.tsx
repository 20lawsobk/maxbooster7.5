import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function WorkerUpdatePrompt() {
  const [worker, setWorker] = useState<ServiceWorker | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => {
    let prepared = false;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    const lockEditing = (locked: boolean) => {
      const root = document.getElementById("root");
      if (root) root.inert = locked;
      setReviewing(locked);
    };
    const available = (event: Event) => setWorker((event as CustomEvent<ServiceWorker>).detail);
    const receive = (event: MessageEvent) => {
      if (event.data?.type === "APP_UPDATE_CANCELLED") {
        prepared = false;
        lockEditing(false);
        clearTimeout(releaseTimer);
        return;
      }
      if (event.data?.type !== "PREPARE_APP_UPDATE") return;
      // Never declare a hidden/frozen editor safe or infer a successful save
      // from a form submit. Each open tab requires an explicit acknowledgment.
      const ready = document.visibilityState === "visible" &&
        window.confirm("An application update is ready. Save your work (or save a local project draft) first. Reload this tab now? Cancel to keep editing.");
      prepared = ready;
      lockEditing(ready);
      clearTimeout(releaseTimer);
      if (ready) releaseTimer = setTimeout(() => { prepared = false; lockEditing(false); }, 18000);
      (event.source as ServiceWorker | null)?.postMessage({
        type: "APP_UPDATE_ACK", token: event.data.token, ready,
        build: Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
          .map(script => script.src).sort().join("|"),
      });
    };
    const changed = () => { if (prepared) window.location.reload(); };
    window.addEventListener("sw-update-available", available);
    navigator.serviceWorker?.addEventListener("message", receive);
    navigator.serviceWorker?.addEventListener("controllerchange", changed);
    return () => {
      clearTimeout(releaseTimer);
      const root = document.getElementById("root");
      if (root) root.inert = false;
      window.removeEventListener("sw-update-available", available);
      navigator.serviceWorker?.removeEventListener("message", receive);
      navigator.serviceWorker?.removeEventListener("controllerchange", changed);
    };
  }, []);

  if (reviewing) return createPortal(<div role="alert" aria-live="assertive" className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 p-8">
    <p>Update approved for this tab. Waiting for the other tabs; editing will resume if the update is postponed.</p>
  </div>, document.body);
  if (!worker) return null;
  return <div role="status" className="fixed bottom-4 left-4 z-[100] max-w-md rounded-lg border bg-background p-4 shadow-lg">
    <p>A new version is ready. Save your work in every open tab before updating.</p>
    {message && <p role="alert" className="mt-2 text-sm">{message}</p>}
    <button className="mt-3 rounded border px-3 py-2" disabled={busy} onClick={() => {
      setBusy(true);
      setMessage("Waiting for every open tab to approve the update…");
      const channel = new MessageChannel();
      const timeout = setTimeout(() => {
        channel.port1.close();
        setBusy(false);
        setMessage("Update not approved by every tab. Close other tabs after saving and retry.");
      }, 18000);
      channel.port1.onmessage = event => {
        clearTimeout(timeout);
        channel.port1.close();
        setBusy(false);
        if (!event.data?.accepted) setMessage(event.data?.error || "Update postponed. Your current version remains active.");
      };
      worker.postMessage({ type: "REQUEST_APP_UPDATE" }, [channel.port2]);
    }}>{busy ? "Waiting for tabs…" : "Review and install update"}</button>
  </div>;
}