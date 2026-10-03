import puppeteer from "puppeteer-core";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import fs from "fs";

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
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
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

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 816, height: 1056 });

    const fileUrl = pathToFileURL(path.resolve(htmlPath)).href;
    console.log(`Loading: ${fileUrl}`);
    await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 30000 });

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
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generatePatentPdf().catch((err) => {
    console.error("Error generating PDF:", err);
    process.exit(1);
  });
}
