/**
 * Browser QA for the ad funnel and the admin Lead Collection.
 *
 *   node scripts/browser-ad-funnel-qa.mjs
 *
 * Drives a real Chrome through the visitor journey (quick match -> free messages ->
 * verification modal) and then through the CRM lead list, on desktop and at 390px.
 * Screenshots land in qa_screenshots_ad_funnel/ and every console error is reported.
 */

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOTS = path.resolve(process.cwd(), 'qa_screenshots_ad_funnel');
const STAMP = Date.now();

fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0;
let failed = 0;
const consoleErrors = [];
const failedRequests = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
  return !!condition;
}

function section(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The dev server compiles routes on demand (and falls back to WASM on this machine),
 * so UI transitions can take many seconds. Poll instead of guessing a fixed delay.
 */
async function waitFor(page, fn, { timeout = 45000, arg = null } = {}) {
  try {
    await page.waitForFunction(fn, { timeout, polling: 400 }, arg);
    return true;
  } catch {
    return false;
  }
}

async function shoot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

function instrument(page, tag) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // React DevTools nudges and favicon noise are not defects. Neither is the 403 the
      // browser logs when the verification gate deliberately rejects message three.
      if (/Download the React DevTools|favicon/i.test(text)) return;
      if (/status of 403/.test(text)) return;
      consoleErrors.push(`[${tag}] ${text}`);
    }
  });
  page.on('pageerror', (err) => consoleErrors.push(`[${tag}] uncaught: ${err.message}`));
  page.on('requestfailed', (req) => {
    // Next.js cancels in-flight RSC prefetches on navigation; that abort is expected.
    if (req.url().includes('_rsc=') && req.failure()?.errorText === 'net::ERR_ABORTED') return;
    failedRequests.push(`[${tag}] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    if (res.status() === 404 && new URL(res.url()).origin === new URL(BASE).origin) {
      failedRequests.push(`[${tag}] 404 ${res.url()}`);
    }
  });
}

/** Clicks the first visible element whose trimmed text matches. */
async function clickByText(page, selector, text) {
  return page.evaluate(
    (sel, needle) => {
      const nodes = [...document.querySelectorAll(sel)];
      const hit = nodes.find((n) => (n.innerText || '').trim().toLowerCase().includes(needle.toLowerCase()));
      if (!hit) return false;
      hit.click();
      return true;
    },
    selector,
    text
  );
}

async function textOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.innerText : '';
  }, selector);
}

async function runVisitorJourney(browser, { width, height, tag }) {
  section(`Visitor funnel — ${tag} (${width}x${height})`);

  // Each visitor needs a clean cookie jar, otherwise the second journey inherits the
  // first one's guest session and is no longer treated as a first-time ad visitor.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  instrument(page, tag);
  await page.setViewport({ width, height });

  const campaign = `qa_browser_${tag}_${STAMP}`;
  await page.goto(
    `${BASE}/?utm_source=facebook&utm_medium=cpc&utm_campaign=${campaign}`,
    { waitUntil: 'networkidle2', timeout: 60000 }
  );
  await wait(1500);
  check('Landing page renders without registration wall', (await textOf(page, 'body')).length > 200);
  await shoot(page, `${tag}-01-landing`);

  const isQuickMatchOpen = () =>
    /what should .* call you|start chatting with|just your name/i.test(document.body.innerText);

  // Open the quick match flow from a profile card.
  await waitFor(page, () => /Say hi|View/i.test(document.body.innerText), { timeout: 60000 });

  const openedFromCard = await page.evaluate(() => {
    const sayHi = [...document.querySelectorAll('button')].find((b) =>
      /say hi/i.test((b.innerText || '').trim())
    );
    if (!sayHi) return false;
    sayHi.click();
    return true;
  });

  let quickMatchVisible = await waitFor(page, isQuickMatchOpen, { timeout: 30000 });

  if (!quickMatchVisible) {
    await clickByText(page, 'button', 'View');
    await waitFor(page, () => /say hi/i.test(document.body.innerText), { timeout: 20000 });
    if (await clickByText(page, 'button', 'Say hi')) {
      quickMatchVisible = await waitFor(page, isQuickMatchOpen, { timeout: 20000 });
    }
  }

  check('Quick Match drawer opens for an ad visitor', quickMatchVisible, `card entry: ${openedFromCard}`);
  await shoot(page, `${tag}-02-quick-match`);

  if (!quickMatchVisible) {
    await context.close();
    return null;
  }

  const visitorName = `Browser Lead ${tag} ${STAMP}`;
  await page.evaluate((name) => {
    const inputs = [...document.querySelectorAll('input[type="text"]')];
    const nameInput = inputs.find((i) => /name/i.test(i.placeholder || '') || /name/i.test(i.name || '')) || inputs[0];
    if (nameInput) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(nameInput, name);
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, visitorName);
  await wait(300);

  const started = await clickByText(page, 'button', 'Start chatting');
  check('"Start chatting" submits with no email or password', started);

  const inMessenger = await waitFor(
    page,
    () => !!document.querySelector('input[placeholder="Write a message..."]'),
    { timeout: 60000 }
  );
  check('Visitor lands straight in the messenger', inMessenger);
  await shoot(page, `${tag}-03-messenger`);

  if (!inMessenger) {
    await context.close();
    return null;
  }

  async function sendMessage(text) {
    const selector = 'input[placeholder="Write a message..."]';
    await page.focus(selector);
    await page.evaluate((sel) => {
      const box = document.querySelector(sel);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(box, '');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }, selector);
    await page.type(selector, text, { delay: 8 });
    await wait(200);
    await page.keyboard.press('Enter');
  }

  async function sendAndExpect(text, snippet) {
    await sendMessage(text);
    return waitFor(page, (needle) => document.body.innerText.includes(needle), {
      timeout: 30000,
      arg: snippet,
    });
  }

  const firstDelivered = await sendAndExpect('Hi! I found you through the ad.', 'I found you through the ad');
  const secondDelivered = await sendAndExpect('Do you have time to chat?', 'Do you have time to chat');
  check('First two messages send with no verification', firstDelivered && secondDelivered);
  await shoot(page, `${tag}-04-two-messages`);

  await sendMessage('Third message should be gated');
  const gateVisible = await waitFor(
    page,
    () => /verify|verification/i.test(document.body.innerText) && /telegram/i.test(document.body.innerText),
    { timeout: 30000 }
  );
  check('Verification modal appears on the third message', gateVisible);

  const allThree = await page.evaluate(() => {
    const t = document.body.innerText;
    return /mobile|phone/i.test(t) && /whatsapp/i.test(t) && /telegram/i.test(t);
  });
  check('All three verification options are offered', allThree);
  await shoot(page, `${tag}-05-verification-modal`);

  const whatsapp = `+8807${String(STAMP).slice(-8)}${tag === 'mobile' ? '1' : '2'}`;
  await clickByText(page, 'button', 'WhatsApp');
  await wait(600);
  await page.evaluate((value) => {
    const boxes = [...document.querySelectorAll('input')].filter((i) => i.offsetParent !== null);
    const box = boxes.find((i) => /whatsapp|number|phone|telegram|contact/i.test(i.placeholder || '')) || boxes.pop();
    if (!box) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(box, value);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }, whatsapp);
  await wait(400);
  await shoot(page, `${tag}-06-verification-filled`);

  const submitted =
    (await clickByText(page, 'button', 'Save & keep chatting')) ||
    (await clickByText(page, 'button', 'Verify'));
  check('Verification form submits', submitted);

  const unlocked = await waitFor(
    page,
    () => document.body.innerText.includes('Third message should be gated'),
    { timeout: 45000 }
  );
  check('The held message is delivered after verifying', unlocked);
  await shoot(page, `${tag}-07-unlocked`);

  const chatsFreely = await sendAndExpect('And now I can keep talking freely.', 'keep talking freely');
  check('Verified visitor chats without further prompts', chatsFreely);
  await shoot(page, `${tag}-08-verified-chat`);

  await page.close();
  await context.close();
  return { visitorName, whatsapp };
}

async function runAdminJourney(browser, leads) {
  section('Admin CRM — Lead Collection (1440x900)');

  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  instrument(page, 'admin');
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('button[type="submit"]', { timeout: 60000 });
  await page.click('button[type="submit"]');
  await page.waitForSelector('aside', { timeout: 60000 });
  check('Admin signs in to the CRM', true);
  await wait(1500);

  const openedUsers = await clickByText(page, 'aside button', 'User Management');
  check('User Management tab opens', openedUsers);
  await wait(2500);

  const heading = await textOf(page, 'h2');
  check('Tab is titled "Lead Collection"', /lead collection/i.test(heading), heading);

  const hasSegments = await page.evaluate(() => {
    const t = document.body.innerText;
    return /All Leads/i.test(t) && /Complete/i.test(t) && /Incomplete/i.test(t);
  });
  check('Lead stage segmented control is present', hasSegments);
  await shoot(page, 'admin-01-lead-collection');

  // The header row is styled uppercase, so compare on lowercase text.
  const headers = await page.evaluate(() =>
    [...document.querySelectorAll('table thead th')].map((th) => th.innerText.trim().toLowerCase())
  );
  check(
    'Table exposes verification, contact and source columns',
    ['lead', 'requirements', 'verification', 'direct contact', 'source', 'status'].every((h) =>
      headers.includes(h)
    ),
    headers.join(' | ')
  );

  for (const lead of leads.filter(Boolean)) {
    const found = await page.evaluate((name) => document.body.innerText.includes(name), lead.visitorName);
    check(`Browser lead "${lead.visitorName}" appears in the CRM`, found);
  }

  const waLinks = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="https://wa.me/"]')].map((a) => a.getAttribute('href'))
  );
  check('WhatsApp click-to-chat links are rendered', waLinks.length > 0, `${waLinks.length} link(s)`);

  const verifiedLead = leads.find(Boolean);
  if (verifiedLead) {
    const digits = verifiedLead.whatsapp.replace(/[^0-9]/g, '');
    check(
      'WhatsApp link points at the verified number',
      waLinks.some((h) => h.includes(digits)),
      waLinks[0]
    );
  }

  const linkTargets = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="https://wa.me/"], a[href^="https://t.me/"]')].every(
      (a) => a.target === '_blank' && (a.rel || '').includes('noopener')
    )
  );
  check('Outbound contact links open safely in a new tab', linkTargets);

  // Complete filter
  await clickByText(page, 'button', 'Complete');
  await wait(1500);
  const completeRows = await page.evaluate(
    () => document.querySelectorAll('table tbody tr').length
  );
  const completeHasIncompleteBadge = await page.evaluate(() =>
    [...document.querySelectorAll('table tbody tr')].some((tr) => /Incomplete/i.test(tr.innerText))
  );
  check('Complete filter shows only verified leads', completeRows > 0 && !completeHasIncompleteBadge, `${completeRows} row(s)`);
  await shoot(page, 'admin-02-complete-leads');

  // Incomplete filter
  await clickByText(page, 'button', 'Incomplete');
  await wait(1500);
  const incompleteClean = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('table tbody tr')];
    if (rows.length === 0) return true;
    return rows.every((tr) => !/Complete\b/i.test(tr.innerText) || /Incomplete/i.test(tr.innerText));
  });
  const incompleteShowsPlaceholder = await page.evaluate(() =>
    /Awaiting verification|No leads in this view/i.test(document.body.innerText)
  );
  check('Incomplete filter shows only unverified leads', incompleteClean);
  check('Unverified rows explain the missing contact', incompleteShowsPlaceholder);
  await shoot(page, 'admin-03-incomplete-leads');

  // Search by contact
  await clickByText(page, 'button', 'All Leads');
  await wait(1200);
  if (verifiedLead) {
    const digits = verifiedLead.whatsapp.replace(/[^0-9]/g, '').slice(-8);
    await page.evaluate((value) => {
      const box = document.querySelector('input[placeholder*="Search" i]');
      if (!box) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(box, value);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }, digits);
    await wait(2500);
    const searchHit = await page.evaluate(
      (name) => document.body.innerText.includes(name),
      verifiedLead.visitorName
    );
    check('Searching by contact number finds the lead', searchHit, digits);
    await shoot(page, 'admin-04-search-by-contact');
  }

  // Mobile width sanity: the table must scroll rather than overflow the page.
  await page.setViewport({ width: 390, height: 844 });
  await wait(1500);
  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 2
  );
  check('Admin lead table does not overflow at 390px', noHorizontalOverflow);
  await shoot(page, 'admin-05-mobile');

  await page.close();
  await context.close();
}

async function run() {
  console.log(`\nBrowser QA — Ad Funnel & Lead Collection against ${BASE}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const desktopLead = await runVisitorJourney(browser, { width: 1440, height: 900, tag: 'desktop' });
    const mobileLead = await runVisitorJourney(browser, { width: 390, height: 844, tag: 'mobile' });
    await runAdminJourney(browser, [desktopLead, mobileLead]);

    section('Console & network audit');
    check('No uncaught console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' || '));
    check('No failed requests or 404s', failedRequests.length === 0, failedRequests.slice(0, 5).join(' || '));
  } finally {
    await browser.close();
  }

  console.log(`\n${'='.repeat(56)}`);
  console.log(`  Passed: ${passed}    Failed: ${failed}`);
  console.log(`  Screenshots: ${SHOTS}`);
  console.log('='.repeat(56));
  if (failed > 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error('\nBrowser QA crashed:', err);
  process.exitCode = 1;
});
