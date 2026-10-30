import cluster from "node:cluster";
import { isPythonRestarting, setPythonRestarting } from "../../../external/maxcore/artifacts/api-server/src/server-state.ts";

const timeout = setTimeout(() => {
  for (const worker of Object.values(cluster.workers ?? {})) worker?.kill();
  process.exit(1);
}, 8000);
if (cluster.isPrimary) {
  setPythonRestarting(true);
  const worker = cluster.fork();
  worker.on("message", message => {
    if (message.observed === "held") setPythonRestarting(false);
    if (message.observed === "released") {
      worker.disconnect();
      clearTimeout(timeout);
      console.log("PASS primary startup state and recovery reach worker");
    }
  });
} else {
  let reportedHold = false;
  const timer = setInterval(() => {
    if (isPythonRestarting() && !reportedHold) {
      reportedHold = true;
      process.send({ observed: "held" });
    } else if (reportedHold && !isPythonRestarting()) {
      process.send({ observed: "released" });
      clearInterval(timer);
      clearTimeout(timeout);
    }
  }, 10);
}