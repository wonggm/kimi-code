// apps/kimi-web/bench/util.mjs
// Shared helpers for the bench drivers (run/capture/diff): sleep, HTTP probes,
// and dev-server lifecycle. The dev server is started only when not already
// reachable, and a server we start is always torn down on exit.

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** apps/kimi-web — the package these scripts belong to. */
export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEV_PORT = Number(process.env.WEB_PORT) || 5175;
export const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Probe a URL; resolves true on any HTTP response, false on error/timeout. */
export function reachable(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

export function httpGetJson(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`timeout fetching ${url}`));
    });
    req.on('error', reject);
  });
}

/**
 * Use the dev server at DEV_URL if it is already up; otherwise spawn
 * `pnpm run dev` in the app dir and wait for it. Returns `{ url, stop }` —
 * `stop()` kills the server only when this helper spawned it (a pre-existing
 * server is left running, since the caller did not start it).
 */
export async function ensureDevServer() {
  if (await reachable(DEV_URL)) {
    return { url: DEV_URL, spawned: false, child: null, stop: async () => {} };
  }
  // detached:true makes `pnpm run dev` its own process-group leader so the Vite
  // child it forks dies with it when we kill the group (killing the pnpm leader
  // alone orphaned Vite before, leaking the dev server).
  const child = spawn('pnpm', ['run', 'dev'], {
    cwd: APP_DIR,
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
    env: { ...process.env, WEB_PORT: String(DEV_PORT) },
  });
  child.stderr.on('data', () => {}); // drain to avoid backpressure
  child.unref();
  const killDev = () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* gone */
    }
    try {
      child.kill('SIGTERM');
    } catch {
      /* gone */
    }
  };
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[bench] dev server exited early with code ${code}`);
    }
  });

  const start = Date.now();
  while (!(await reachable(DEV_URL))) {
    if (Date.now() - start > 120_000) {
      killDev();
      throw new Error('dev server did not become reachable within 120s');
    }
    await sleep(500);
  }
  // Give Vite a beat to finish module graph warm-up before the first navigate.
  await sleep(1000);
  return {
    url: DEV_URL,
    spawned: true,
    child,
    stop: async () => {
      killDev();
      await sleep(300);
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* gone */
      }
    },
  };
}
