import assert from "node:assert/strict";
import { brotliDecompressSync } from "node:zlib";
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const expectedText = "specific middle phrase";

async function getFreePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a local test port");
  server.close();
  await new Promise((resolve, reject) => {
    server.once("close", resolve);
    server.once("error", reject);
  });
  return address.port;
}

async function startVite(port) {
  const vitePath = resolve(repoRoot, "node_modules/vite/bin/vite.js");
  const server = spawn(process.execPath, [vitePath, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.setEncoding("utf8");
  server.stderr.setEncoding("utf8");
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  const fixtureUrl = `http://127.0.0.1:${port}/tests/chatMessageSelection.fixture.html`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited early:\n${output}`);
    try {
      const response = await fetch(fixtureUrl);
      if (response.ok) return { server, fixtureUrl };
    } catch {
      // Vite is still starting.
    }
    await delay(50);
  }
  server.kill("SIGTERM");
  throw new Error(`Vite did not become ready:\n${output}`);
}

async function unpackLinuxRuntimeLibraries() {
  if (process.platform !== "linux") {
    if (!process.env.CHROME_BIN) {
      throw new Error("Set CHROME_BIN to a local Chromium executable to run this test outside Linux.");
    }
    return null;
  }
  const packageEntry = require.resolve("@sparticuz/chromium");
  const archivePath = resolve(dirname(packageEntry), "../bin/al2023.tar.br");
  const runtimeDir = await mkdtemp(join(tmpdir(), "freetalk-chromium-libs-"));
  const archivePathOnDisk = join(runtimeDir, "al2023.tar");
  const archive = brotliDecompressSync(await readFile(archivePath));
  await writeFile(archivePathOnDisk, archive);
  execFileSync("tar", ["-xf", archivePathOnDisk, "-C", runtimeDir]);
  process.env.LD_LIBRARY_PATH = [join(runtimeDir, "lib"), process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(delimiter);
  return runtimeDir;
}

let vite;
let browser;
let runtimeDir;
try {
  const port = await getFreePort();
  const started = await startVite(port);
  vite = started.server;

  runtimeDir = await unpackLinuxRuntimeLibraries();
  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto(started.fixtureUrl, { waitUntil: "networkidle0" });
  await page.waitForSelector(".msg-row .msg-answer p");

  const coordinates = await page.evaluate((needle) => {
    const textNode = document.querySelector(".msg-row .msg-answer p")?.firstChild;
    if (!(textNode instanceof Text)) throw new Error("Expected a paragraph text node");
    const start = textNode.data.indexOf(needle);
    if (start < 0) throw new Error(`Could not find selected phrase: ${needle}`);
    const charRect = (offset) => {
      const range = document.createRange();
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset + 1);
      return range.getBoundingClientRect().toJSON();
    };
    return { first: charRect(start), last: charRect(start + needle.length - 1) };
  }, expectedText);

  const y = coordinates.first.y + coordinates.first.height / 2;
  await page.mouse.move(coordinates.first.x + 0.2, y);
  await page.mouse.down();
  await page.mouse.move(coordinates.last.right - 0.2, y, { steps: 15 });
  await page.mouse.up();

  const selectedText = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  assert.equal(
    selectedText,
    expectedText,
    `Dragging across the middle of a paragraph should select only the dragged text; got ${JSON.stringify(selectedText)}`
  );
  await page.waitForSelector('.msg-selection-ask-btn[aria-label="Ask about selected text"]');
  await page.click(".msg-selection-ask-btn");
  await page.waitForFunction((text) => document.querySelector("#queued-text")?.textContent === text, {}, expectedText);
  assert.equal(await page.$eval("#queued-text", (node) => node.textContent), expectedText);
  console.log("PASS: mouse selection stays on the highlighted phrase and Ask queues exactly that phrase.");

  const origin = new URL(started.fixtureUrl).origin;
  await page.goto(`${origin}/tests/contextsPanelActions.fixture.html`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".context-thumb-more");
  const contextMenus = [
    { label: "Reference image", selector: '[aria-label="Actions for Reference image"]' },
    { label: "Selected paragraph text", selector: '[aria-label="Actions for Selected paragraph text"]' },
    { label: "TypeScript · example.ts", selector: '[aria-label="Actions for TypeScript · example.ts"]' },
    { label: "Table · Camera specs", selector: '[aria-label="Actions for Table · Camera specs"]' },
  ];
  for (const trigger of contextMenus) {
    await page.click(trigger.selector);
    const menu = await page.$(".context-actions-menu");
    assert.ok(menu, `Clicking ${trigger.label}'s ... should open the shared vertical action menu`);
    const menuState = await page.$eval(".context-actions-menu", (element) => {
      const items = [...element.querySelectorAll('[role="menuitem"]')];
      return {
        labels: items.map((item) => item.textContent.trim()),
        positions: items.map((item) => item.getBoundingClientRect().top),
        className: element.className,
      };
    });
    assert.deepEqual(menuState.labels, ["Inject into input", "Show in chat", "Remove from context"]);
    assert.ok(menuState.className.includes("context-actions-menu"));
    assert.ok(menuState.positions[0] < menuState.positions[1] && menuState.positions[1] < menuState.positions[2], `${trigger.label}'s actions should stack vertically`);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".context-actions-menu"));
  }
  console.log("PASS: every artifact type uses the same labeled vertical action menu.");
} finally {
  await browser?.close();
  if (vite && vite.exitCode === null) {
    vite.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => vite.once("exit", resolve)), delay(2_000)]);
  }
  if (runtimeDir) await rm(runtimeDir, { recursive: true, force: true });
}
