import puppeteer from "puppeteer-core";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHROMIUM_PATH = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "";

const HTML_PATH = path.resolve(__dirname, "patent.html");
const OUT_PATH = path.resolve(
  __dirname,
  "../../BLawzMusicLLC_MaxBooster_Patent_Application.pdf",
);

export async function generatePatentPdf(
  htmlPath = HTML_PATH,
  outputPath = OUT_PATH,
  executablePath = CHROMIUM_PATH,
) {
  if (!executablePath) throw new Error("REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE is not set.");
  const documentPath = fs.realpathSync(path.resolve(htmlPath));
  if (!fs.statSync(documentPath).isFile()) throw new Error("Patent source must be an HTML file.");
  const documentRoot = path.dirname(documentPath);
  const prefix = `/${randomUUID()}/`;
  // Serve only this document directory through an owned loopback listener.
  // Browser policies may prohibit file: navigation; no policy override is needed.
  const server = createServer((request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405).end(); return;
      }
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
      const relative = decodeURIComponent(pathname.slice(prefix.length));
      const resolved = fs.realpathSync(path.resolve(documentRoot, relative));
      if (!resolved.startsWith(documentRoot + path.sep) || !fs.statSync(resolved).isFile()) {
        response.writeHead(404).end(); return;
      }
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2",
      };
      response.writeHead(200, { "content-type": mime[path.extname(resolved).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-store", "x-content-type-options": "nosniff" });
      if (request.method === "HEAD") response.end();
      else fs.createReadStream(resolved).on("error", () => response.destroy()).pipe(response);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Patent document listener did not bind.");
  console.log("Launching browser...");
  let browser;
  try {
    browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
    ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 816, height: 1056 });

    const documentUrl = `http://127.0.0.1:${address.port}${prefix}${encodeURIComponent(path.basename(documentPath))}`;
    console.log("Loading local patent document...");
    await page.goto(documentUrl, { waitUntil: "networkidle0", timeout: 30000 });

    await page.evaluate(() => {
      document.title =
        "MaxBooster Patent Application — B-Lawz Music LLC";
    });

    console.log("Generating PDF...");
    await page.pdf({
      path: outputPath,
      format: "Letter",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
      displayHeaderFooter: false,
    });

    const size = fs.statSync(outputPath).size;
    console.log(`PDF generated: ${outputPath} (${(size / 1024).toFixed(1)} KB)`);
    return size;
  } finally {
    try { await browser?.close(); }
    finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generatePatentPdf().catch((err) => {
    console.error("Error generating PDF:", err);
    process.exit(1);
  });
}
