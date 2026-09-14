/**
 * Human-style MatchFunnel browser pass for soft-launch ads.
 *   node scripts/browser-matchfunnel-prod-qa.mjs
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOTS = path.resolve(process.cwd(), 'qa_screenshots_matchfunnel');
const STAMP = Date.now();

fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
  return !!ok;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, fn, timeout = 90000) {
  try {
    await page.waitForFunction(fn, { timeout, polling: 400 });
    return true;
  } catch {
    return false;
  }
}

async function clickContains(page, needle) {
  return page.evaluate((n) => {
    const hit = [...document.querySelectorAll('button')].find((b) =>
      (b.innerText || '').toLowerCase().includes(n.toLowerCase())
    );
    if (!hit || hit.disabled) return false;
    hit.click();
    return true;
  }, needle);
}

async function fillInput(page, value, placeholderHint) {
  return page.evaluate(
    (v, hint) => {
      const inputs = [...document.querySelectorAll('input')];
      const input =
        inputs.find((i) =>
          new RegExp(hint, 'i').test(i.placeholder || i.name || '')
        ) || inputs.find((i) => i.type === 'text' || !i.type) || inputs[0];
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      setter.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    value,
    placeholderHint
  );
}

async function shoot(page, name) {
  try {
    await page.screenshot({
      path: path.join(SHOTS, `${name}.png`),
      fullPage: false,
    });
  } catch (e) {
    console.log(`  (shot skip ${name}: ${e.message})`);
  }
}

async function run() {
  console.log(`\nMatchFunnel production browser QA → ${BASE}\n`);

  let up = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok || res.status < 500) {
        up = true;
        break;
      }
    } catch {
      // retry
    }
    await wait(2000);
  }
  check('Dev server reachable', up);
  if (!up) process.exit(1);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 390, height: 844 },
  });

  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));

  const campaign = `prod_browser_${STAMP}`;
  await page.goto(
    `${BASE}/?utm_source=facebook&utm_medium=cpc&utm_campaign=${campaign}&city=Dubai`,
    { waitUntil: 'domcontentloaded', timeout: 120000 }
  );
  await waitFor(page, () => /Find My Travel Match/i.test(document.body.innerText));
  await shoot(page, '01-landing');

  const body = await page.evaluate(() => document.body.innerText);
  check('MatchFunnel home visible', /Find My Travel Match|I want to meet/i.test(body));
  check('No signup wall on landing', !/create account|sign up to continue/i.test(body));

  check('Find My Travel Match clicked', await clickContains(page, 'Find My Travel Match'));

  const sayHiReady = await waitFor(page, () =>
    /Say Hi to/i.test(document.body.innerText)
  );
  await shoot(page, '02-match');
  check('Match result with Say Hi', sayHiReady);

  // Prefer icebreaker (more reliable than primary CTA during busy state)
  let started = await page.evaluate(() => {
    const ice = [...document.querySelectorAll('button')].find((b) =>
      /Break the ice|Ready to chat/i.test(
        b.parentElement?.parentElement?.innerText || ''
      )
        ? false
        : /looking forward|coffee|explore|dinner|trip/i.test(b.innerText || '')
    );
    // First icebreaker line button in the strip
    const strip = [...document.querySelectorAll('button')].filter((b) =>
      /Hi!|Looking forward|coffee|explore/i.test(b.innerText || '')
    );
    if (strip[0]) {
      strip[0].click();
      return true;
    }
    const cta = [...document.querySelectorAll('button')].find((b) =>
      /Say Hi to/i.test(b.innerText || '')
    );
    if (cta && !cta.disabled) {
      cta.click();
      return true;
    }
    return false;
  });
  if (!started) started = await clickContains(page, 'Say Hi to');
  check('Say Hi / icebreaker starts guest chat', started);

  const namePrompt = await waitFor(page, () =>
    /What should .* call you/i.test(document.body.innerText)
  );
  await shoot(page, '03-name-or-chat');

  if (namePrompt) {
    const visitorName = `ProdLead${String(STAMP).slice(-6)}`;
    check('Name field filled', await fillInput(page, visitorName, 'name'));
    // Name form submit button text is "Say Hi"
    await page.evaluate(() => {
      const form = document.querySelector('form');
      const btn = form?.querySelector('button[type="submit"]');
      btn?.click();
    });
    await wait(1500);
  }

  const composerReady = await waitFor(page, () => !!document.querySelector('textarea'));
  await shoot(page, '04-composer');
  check('Chat composer (textarea) ready', composerReady);

  async function sendMsg(text) {
    const ok = await page.evaluate((t) => {
      const ta = document.querySelector('textarea');
      if (!ta) return false;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      ).set;
      setter.call(ta, t);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, text);
    if (!ok) return false;
    // Prefer send button; fallback Enter
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => {
        const label = (b.getAttribute('aria-label') || '') + (b.innerText || '');
        return /send/i.test(label);
      });
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    });
    if (!clicked) await page.keyboard.press('Enter');
    await wait(1200);
    return true;
  }

  check('Message 1 sent', composerReady && (await sendMsg(`Hey browser QA ${STAMP} #1`)));
  check('Message 2 sent', composerReady && (await sendMsg(`Still free ${STAMP} #2`)));
  if (composerReady) await sendMsg(`Gate please ${STAMP} #3`);
  await wait(2000);
  await shoot(page, '05-after-third');

  const verifyVisible = await waitFor(
    page,
    () => /whatsapp|telegram|verify your|phone/i.test(document.body.innerText),
    45000
  );
  check('Verification gate UI appears', verifyVisible);

  if (verifyVisible) {
    await clickContains(page, 'WhatsApp');
    await wait(400);
    const phone = `+9715${String(STAMP).slice(-8)}`;
    await fillInput(page, phone, 'phone|whatsapp|number|\\+');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /verify|continue|submit|confirm/i.test(b.innerText || '')
      );
      btn?.click();
    });
    await wait(2000);
    await shoot(page, '06-verified');
  }

  // Admin CRM
  const admin = await context.newPage();
  await admin.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait(1500);

  const needsLogin = await admin.evaluate(
    () => !!document.querySelector('input[type="password"]')
  );
  if (needsLogin) {
    await fillInput(admin, 'admin@heartlink.com', 'email');
    await admin.evaluate(() => {
      const pass = document.querySelector('input[type="password"]');
      if (!pass) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      setter.call(pass, 'Admin@123456');
      pass.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await admin.evaluate(() => {
      const btn =
        document.querySelector('button[type="submit"]') ||
        [...document.querySelectorAll('button')].find((b) =>
          /sign in|log in|login|access/i.test(b.innerText || '')
        );
      btn?.click();
    });
    await waitFor(admin, () => /Master Inbox|Lead Collection/i.test(document.body.innerText));
  }

  await admin.evaluate(() => {
    const tab = [...document.querySelectorAll('button')].find((b) =>
      /Lead Collection/i.test(b.innerText || '')
    );
    tab?.click();
  });
  await wait(2000);
  await shoot(admin, '07-admin-leads');
  const leadText = await admin.evaluate(() => document.body.innerText);
  check(
    'Admin Lead Collection loaded',
    /Lead Collection|Complete|Incomplete|Device/i.test(leadText)
  );

  const hardErrors = consoleErrors.filter(
    (e) => !/ResizeObserver|hydration|Minified React/i.test(e)
  );
  check('No hard page crashes', hardErrors.length === 0, hardErrors.slice(0, 2).join(' | '));

  await browser.close();

  console.log(`\n========================================================`);
  console.log(`  Passed: ${passed}    Failed: ${failed}`);
  console.log(`  Screenshots: ${SHOTS}`);
  console.log(`========================================================\n`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error('Browser QA crashed:', err);
  process.exit(1);
});
