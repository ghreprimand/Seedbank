#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const DEFAULT_BASE_URL = 'http://127.0.0.1:5173';
const DEFAULT_API_URL = 'http://127.0.0.1:4800';
const DEFAULT_OUT_DIR = 'docs/assets/screenshots';

const DEMO_IDEA_ID = '11111111-1111-4111-8111-111111111111';

function parseArgs(argv) {
  const out = {
    baseUrl: DEFAULT_BASE_URL,
    apiUrl: DEFAULT_API_URL,
    outDir: DEFAULT_OUT_DIR,
    seed: true,
    strictHelp: false,
  };

  for (const arg of argv) {
    if (arg === '--skip-seed') out.seed = false;
    else if (arg === '--strict-help') out.strictHelp = true;
    else if (arg.startsWith('--base-url=')) out.baseUrl = arg.split('=')[1] || DEFAULT_BASE_URL;
    else if (arg.startsWith('--api-url=')) out.apiUrl = arg.split('=')[1] || DEFAULT_API_URL;
    else if (arg.startsWith('--out-dir=')) out.outDir = arg.split('=')[1] || DEFAULT_OUT_DIR;
    else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node scripts/capture-readme-screenshots.mjs [options]

Options:
  --base-url=<url>     App URL (default: ${DEFAULT_BASE_URL})
  --api-url=<url>      API URL (default: ${DEFAULT_API_URL})
  --out-dir=<path>     Output directory (default: ${DEFAULT_OUT_DIR})
  --skip-seed          Do not seed deterministic demo data
  --strict-help        Fail if Help/Manual overlay cannot be captured
  -h, --help           Show this help
`);
      process.exit(0);
    }
  }

  return out;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function apiJson(apiUrl, route, init = {}) {
  const url = `${apiUrl}${route}`;
  const headers = { 'content-type': 'application/json', ...(init.headers ?? {}) };
  const response = await fetch(url, { ...init, headers });
  const raw = await response.text();
  const body = raw ? (() => {
    try { return JSON.parse(raw); } catch { return raw; }
  })() : null;

  if (!response.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`${init.method ?? 'GET'} ${route} failed (${response.status}): ${detail}`);
  }
  return body;
}

async function seedDemoData(apiUrl) {
  const now = new Date().toISOString();
  const archive = {
    seedbankVersion: 1,
    exportedAt: now,
    ideas: [
      {
        id: DEMO_IDEA_ID,
        title: 'Lantern Garden Journal',
        pitch: 'A cozy app for tracking tiny progress rituals in game dev sessions.',
        category: 'app',
        stage: 'pitch',
        tags: ['cozy', 'ritual', 'journal'],
        moodLabels: ['grounded', 'warm'],
        fullNotes: 'Focus on small daily check-ins, visible streaks, and reflective prompts.',
        hook: 'Open the app, answer one reflective prompt, continue building.',
        whyItMightWork: 'Reduces startup friction and supports consistency over intensity.',
        risks: 'Could become generic without a clear ritual loop.',
        techStack: 'React + local-first storage + optional AI reflection prompts.',
        jamScore: 4,
        excitementScore: 5,
        relatedIdeaIds: [],
        links: [{ label: 'Reference', url: 'https://example.com/seedbank-demo' }],
        images: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        graduatedTo: null,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Rainwalk Audio Board',
        pitch: 'Prototype board for arranging short ambient scene loops.',
        category: 'tool',
        stage: 'sprout',
        tags: ['audio', 'prototype'],
        moodLabels: ['misty'],
        fullNotes: 'Drag and layer loops, save scene presets, export references.',
        hook: 'Sketch an ambience in under 2 minutes.',
        whyItMightWork: 'Fast loop sketching for creators who avoid full DAWs.',
        risks: 'Hard to stand out from existing loop tools.',
        techStack: 'WebAudio + local persistence.',
        jamScore: 3,
        excitementScore: 4,
        relatedIdeaIds: [],
        links: [],
        images: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        graduatedTo: null,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Patch Notes Postcard',
        pitch: 'Generate lightweight release postcards for tiny shipped changes.',
        category: 'open-source-utility',
        stage: 'seed',
        tags: ['release', 'notes'],
        moodLabels: ['crisp'],
        fullNotes: 'Turn commits into human tone notes.',
        hook: 'One click from commit range to readable update.',
        whyItMightWork: 'Maintainers want clarity without writing full posts.',
        risks: 'Commit messages may be noisy.',
        techStack: 'CLI + markdown templates.',
        jamScore: 5,
        excitementScore: 3,
        relatedIdeaIds: [],
        links: [],
        images: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        graduatedTo: null,
      },
    ],
    versions: [],
  };

  await apiJson(apiUrl, '/api/import', {
    method: 'POST',
    body: JSON.stringify({ archive, mode: 'replace' }),
  });

  await apiJson(apiUrl, '/api/settings/ui', {
    method: 'PATCH',
    body: JSON.stringify({ theme: { name: 'paper', matchSystem: false } }),
  });

  await apiJson(apiUrl, '/api/settings/api', {
    method: 'PATCH',
    body: JSON.stringify({
      webhooks: {
        url: 'https://example.invalid/seedbank-webhook',
        events: ['idea.created', 'idea.graduated'],
      },
    }),
  });

  await apiJson(apiUrl, '/api/tokens', {
    method: 'POST',
    body: JSON.stringify({
      name: 'docs-demo-token',
      scopes: ['read:ideas', 'mcp:read'],
    }),
  });
}

async function waitForApp(baseUrl) {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.ok || response.status === 304) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`App did not respond at ${baseUrl}`);
}

async function screenshot(page, outDir, fileName, options = {}) {
  const target = path.join(outDir, fileName);
  await page.screenshot({
    path: target,
    type: 'jpeg',
    quality: 84,
    ...options,
  });
  console.log(`captured: ${target}`);
}

async function openRoute(page, baseUrl, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
}

async function setThemeFromNames(page, names) {
  const picked = await page.evaluate((candidates) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const candidate of candidates) {
      const normalized = candidate.toLowerCase();
      const button = buttons.find((b) => (b.textContent ?? '').toLowerCase().includes(normalized));
      if (button) {
        button.click();
        return candidate;
      }
    }
    return null;
  }, names);
  return picked;
}

async function tryOpenHelpOverlay(page) {
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const target = candidates.find((el) => /\b(help|manual)\b/i.test((el.textContent ?? '').trim()));
    if (!target) return false;
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });
  if (!clicked) return false;
  await page.waitForTimeout(350);
  return true;
}

async function redactApiServerSensitiveText(page) {
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('section div'));
    for (const row of rows) {
      const text = row.textContent ?? '';
      if (text.includes('Database')) {
        const monos = row.querySelectorAll('span');
        if (monos.length > 1) {
          monos[1].textContent = '<seedbank-data-dir>/seedbank.db';
        }
      }
    }
  });
}

async function captureSet(config) {
  const { baseUrl, outDir, strictHelp } = config;
  await waitForApp(baseUrl);
  ensureDir(outDir);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1520, height: 940 },
    colorScheme: 'light',
  });
  const page = await context.newPage();

  try {
    await openRoute(page, baseUrl, '/');
    await page.waitForSelector('text=The Garden', { timeout: 10000 });
    await screenshot(page, outDir, 'garden-overview.jpg');

    await openRoute(page, baseUrl, `/idea/${DEMO_IDEA_ID}`);
    const thinkingButton = page.getByRole('button', { name: /thinking partner/i });
    await thinkingButton.scrollIntoViewIfNeeded();
    await thinkingButton.click();
    await page.waitForTimeout(250);
    await screenshot(page, outDir, 'idea-detail-thinking-partner.jpg');

    await openRoute(page, baseUrl, '/settings/theme');
    await page.waitForSelector('text=Choose a theme', { timeout: 10000 });
    await screenshot(page, outDir, 'settings-theme.jpg');

    await openRoute(page, baseUrl, '/settings/ai-agents');
    await page.waitForSelector('text=Thinking Partner · Providers', { timeout: 10000 });
    await screenshot(page, outDir, 'settings-ai-agents.jpg');

    await openRoute(page, baseUrl, '/settings/api');
    await page.waitForSelector('text=Personal Access Tokens', { timeout: 10000 });
    await redactApiServerSensitiveText(page);
    await screenshot(page, outDir, 'settings-api-server.jpg');

    await openRoute(page, baseUrl, '/settings/theme');
    const darkPicked = await setThemeFromNames(page, ['Peat', 'Canopy', 'Loam', 'Moss']);
    if (darkPicked) {
      await page.waitForTimeout(250);
      await screenshot(page, outDir, 'theme-dark-view.jpg');
      console.log(`theme captured (dark): ${darkPicked}`);
    } else {
      console.warn('dark theme candidate not found; skipped theme-dark-view.jpg');
    }

    const midPicked = await setThemeFromNames(page, ['Hearth', 'Rainwash', 'Dusk', 'Parchment']);
    if (midPicked) {
      await page.waitForTimeout(250);
      await screenshot(page, outDir, 'theme-mid-view.jpg');
      console.log(`theme captured (mid): ${midPicked}`);
    } else {
      console.warn('mid theme candidate not found; skipped theme-mid-view.jpg');
    }

    await openRoute(page, baseUrl, '/');
    const openedHelp = await tryOpenHelpOverlay(page);
    if (!openedHelp) {
      const message = 'help/manual trigger not found; skipped manual-help-overlay.jpg';
      if (strictHelp) throw new Error(message);
      console.warn(message);
    } else {
      await screenshot(page, outDir, 'manual-help-overlay.jpg');
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  console.log(`screenshot baseUrl=${config.baseUrl} apiUrl=${config.apiUrl} outDir=${config.outDir}`);

  if (config.seed) {
    console.log('seeding deterministic demo data...');
    await seedDemoData(config.apiUrl);
  }

  await captureSet(config);
  console.log('done');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
