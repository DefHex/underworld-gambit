// Bakes the piece characters (src/bake) into sprite sheets: art/sprites/<piece>.png, the team-color
// mask <piece>.team.png, and <piece>.json.
// Starts a Vite dev server, opens /bake.html in headless Chrome or Edge, and saves what it renders.
//
//   npm run bake          (then `npm run sprites` builds them for the game)
//
// Set CHROME_PATH if the browser is not in a standard location.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = path.join(ROOT, 'art/sprites');
const DEBUG_PORT = 9334;
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Connects to the browser's first page over the DevTools protocol; returns an evaluate() helper. */
async function connect() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const page = pages.find((target) => target.type === 'page');
      if (page) {
        const socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
        let id = 0;
        const evaluate = (expression) => new Promise((resolve, reject) => {
          const callId = ++id;
          const onMessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.id !== callId) return;
            socket.removeEventListener('message', onMessage);
            const { result, exceptionDetails } = message.result;
            if (exceptionDetails) reject(new Error(exceptionDetails.exception?.description ?? exceptionDetails.text));
            else resolve(result.value);
          };
          socket.addEventListener('message', onMessage);
          socket.send(JSON.stringify({ id: callId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
        });
        return { evaluate, close: () => socket.close() };
      }
    } catch { /* browser still starting */ }
    await sleep(200);
  }
  throw new Error('could not reach the headless browser');
}

const browserPath = BROWSERS.find((candidate) => candidate && fs.existsSync(candidate));
if (!browserPath) throw new Error('No Chrome or Edge found; set CHROME_PATH');

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0] + 'bake.html';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bake-'));
const browser = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', url,
], { stdio: 'ignore' });

try {
  const page = await connect();
  for (let attempt = 0; attempt < 100 && !(await page.evaluate('typeof window.bakeAll === "function"')); attempt++) await sleep(200);
  const sheets = await page.evaluate('window.bakeAll()');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const save = (file, dataUrl) => fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
  for (const [name, { png, team, meta }] of Object.entries(sheets)) {
    save(`${name}.png`, png);
    save(`${name}.team.png`, team);
    fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(meta) + '\n');
    console.log(`baked ${name}: ${meta.rows.length} rows`);
  }
  page.close();
} finally {
  browser.kill();
  await server.close();
}
