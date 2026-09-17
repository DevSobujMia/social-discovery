import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'audit_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const auditReport = {
  timestamp: new Date().toISOString(),
  pagesAudited: [],
  consoleErrors: [],
  pageCrashes: [],
  networkFailures: [],
  warnings: [],
  passedChecks: [],
};

function recordError(type, details) {
  if (type === 'console') auditReport.consoleErrors.push(details);
  else if (type === 'crash') auditReport.pageCrashes.push(details);
  else if (type === 'network') auditReport.networkFailures.push(details);
  else if (type === 'warning') auditReport.warnings.push(details);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function auditPage(browser, pagePath, pageName, interactions) {
  console.log(`\n========================================`);
  console.log(`Auditing: ${pageName} (${pagePath})`);
  console.log(`========================================`);

  const page = await browser.newPage();
  const pageErrors = [];

  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    // Ignore benign Next.js dev notices or harmless favicon noise
    if (type === 'error') {
      console.error(`  [Browser Console Error] ${text}`);
      pageErrors.push({ page: pageName, text, location: msg.location() });
      recordError('console', { page: pageName, text, location: msg.location() });
    }
  });

  page.on('pageerror', (err) => {
    console.error(`  [Page Crash / Uncaught Error] ${err.message}`);
    recordError('crash', { page: pageName, message: err.message, stack: err.stack });
  });

  page.on('requestfailed', (req) => {
    const url = req.url();
    // Ignore analytics pixel if intentional or aborted requests
    if (!url.includes('/api/events') && !url.includes('favicon')) {
      const failure = req.failure();
      console.warn(`  [Network Request Failed] ${req.method()} ${url} - ${failure?.errorText}`);
      recordError('network', { page: pageName, url, error: failure?.errorText });
    }
  });

  page.on('response', (res) => {
    const status = res.status();
    const url = res.url();
    if (status >= 400 && !url.includes('/api/auth/me') && !url.includes('/api/events')) {
      console.warn(`  [HTTP ${status}] ${res.request().method()} ${url}`);
      recordError('network', { page: pageName, url, status });
    }
  });

  try {
    const response = await page.goto(`${BASE_URL}${pagePath}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    const status = response ? response.status() : 0;
    console.log(`  Initial HTTP status: ${status}`);
    await sleep(2000);

    const title = await page.title();
    console.log(`  Document title: "${title}"`);

    // Screenshot after initial load
    const shotPath = path.join(SCREENSHOT_DIR, `${pageName}_loaded.png`);
    await page.screenshot({ path: shotPath, fullPage: false });

    // Custom page interactions if provided
    if (interactions) {
      await interactions(page, pageName);
    }

    auditReport.pagesAudited.push({ pageName, pagePath, status, title });
    auditReport.passedChecks.push(`${pageName} loaded and rendered successfully`);
  } catch (err) {
    console.error(`  [Fatal Error Auditing Page ${pageName}]: ${err.message}`);
    recordError('crash', { page: pageName, error: err.message, stack: err.stack });
  } finally {
    await page.close();
  }
}

async function runFullAudit() {
  console.log(`Starting Full Site Audit with Chrome at: ${CHROME_PATH}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    // 1. Home / Discover
    await auditPage(browser, '/', 'home_discover', async (page) => {
      // Check for quick match or profile cards
      await page.setViewport({ width: 1280, height: 900 });
      await sleep(1500);

      // Check if MatchFunnel is displayed or profile cards
      const state = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        const cards = document.querySelectorAll('div.group');
        const buttons = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim());
        return {
          hasModal: !!modal,
          cardCount: cards.length,
          buttons: buttons.slice(0, 15),
        };
      });
      console.log(`  Home state:`, state);

      // If Quick Match modal or card exists, click a profile or interaction
      const profileClicked = await page.evaluate(() => {
        // Try clicking on a card to see profile modal
        const card = document.querySelector('div.group');
        if (card) {
          const btn = card.querySelector('button') || card;
          btn.click();
          return true;
        }
        return false;
      });

      if (profileClicked) {
        await sleep(1500);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'home_profile_opened.png') });
        // Try pressing Escape to close
        await page.keyboard.press('Escape');
        await sleep(1000);
      }

      // Test switching tabs: Messenger, Profile, Discover
      const switchedTab = await page.evaluate(() => {
        const navButtons = Array.from(document.querySelectorAll('nav button, header button, footer button'));
        const messengerBtn = navButtons.find((b) => b.textContent && b.textContent.includes('Messages') || b.getAttribute('aria-label')?.includes('Messenger'));
        if (messengerBtn) {
          messengerBtn.click();
          return 'messenger';
        }
        return false;
      });

      if (switchedTab) {
        await sleep(1500);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'home_tab_messenger.png') });
      }
    });

    // 2. Admin Page
    await auditPage(browser, '/admin', 'admin_dashboard', async (page) => {
      await page.setViewport({ width: 1280, height: 900 });
      await sleep(2000);

      // Check if admin login form or dashboard is present
      const adminState = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input')).map((i) => ({
          type: i.type,
          name: i.name,
          placeholder: i.placeholder,
        }));
        const buttons = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim());
        const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => h.textContent?.trim());
        return { inputs, buttons: buttons.slice(0, 10), headings: headings.slice(0, 10) };
      });
      console.log(`  Admin state:`, adminState);

      // Fill login form if present
      const hasLoginForm = await page.$('input[type="email"], input[type="password"]');
      if (hasLoginForm) {
        console.log(`  Logging into admin...`);
        await page.type('input[type="email"]', 'admin@heartlink.com');
        await page.type('input[type="password"]', 'Admin@123456');
        const loginBtn = await page.$('button[type="submit"]');
        if (loginBtn) {
          await loginBtn.click();
          await sleep(3000);
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'admin_after_login.png') });
        }
      }

      // Test clicking various admin tabs
      const tabs = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('nav button, aside button, header button'));
        return btns.map((b) => b.textContent?.trim()).filter(Boolean);
      });
      console.log(`  Admin tabs available:`, tabs);
    });

    // 3. Simulator Page
    await auditPage(browser, '/simulator', 'simulator_page', async (page) => {
      await page.setViewport({ width: 1280, height: 900 });
      await sleep(2000);
      const simInfo = await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => h.textContent?.trim());
        const buttons = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim());
        return { headings, buttons: buttons.slice(0, 10) };
      });
      console.log(`  Simulator info:`, simInfo);
    });

    // 4. Legal / Privacy
    await auditPage(browser, '/legal/privacy', 'legal_privacy');

    // 5. Legal / Terms
    await auditPage(browser, '/legal/terms', 'legal_terms');

  } finally {
    await browser.close();
  }

  console.log(`\n========================================`);
  console.log(`AUDIT SUMMARY`);
  console.log(`========================================`);
  console.log(`Total Pages Audited: ${auditReport.pagesAudited.length}`);
  console.log(`Page Crashes: ${auditReport.pageCrashes.length}`);
  console.log(`Console Errors: ${auditReport.consoleErrors.length}`);
  console.log(`Network Failures: ${auditReport.networkFailures.length}`);

  fs.writeFileSync('audit_results.json', JSON.stringify(auditReport, null, 2));
  console.log(`Full report saved to audit_results.json`);
}

runFullAudit().catch((err) => {
  console.error('Fatal error during audit:', err);
  process.exit(1);
});
