import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

export async function runSection9() {
  console.log('\n==================================================');
  console.log('STARTING SECTION 9 — ADMIN CRM (BROWSER QA)');
  console.log('==================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  const networkErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('400') && !msg.text().includes('401')) {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    console.error('UNCAUGHT PAGE ERROR:', err.message, err.stack);
    consoleErrors.push(err.message);
  });

  page.on('response', response => {
    if (!response.ok() && response.status() !== 304 && !response.url().includes('favicon.ico')) {
      networkErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  try {
    await page.setViewport({ width: 1366, height: 850 });

    // 9.1 Open Admin Portal
    console.log('[9.1] Navigating to http://localhost:3000/admin...');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });

    // 9.2 Perform Admin Login
    console.log('[9.2] Logging into Admin Portal as Super Admin...');
    const loginBtn = await page.waitForSelector('button[type="submit"]', { timeout: 6000 });
    await loginBtn.click();

    // Wait for aside navigation bar to render confirming logged-in state
    await page.waitForSelector('aside', { timeout: 10000 });
    console.log('Super Admin logged in successfully! Sidebar active.');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section9_admin_dashboard.png') });

    // 9.3 Check Analytics KPI Cards
    console.log('[9.3] Checking Analytics KPIs...');
    await new Promise(r => setTimeout(r, 1000));
    const kpisFound = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Total Registered Users') &&
             text.includes('Active Conversations') &&
             text.includes('Total Messages Sent');
    });
    console.log(`Analytics KPI metrics displayed: ${kpisFound}`);
    if (!kpisFound) {
      throw new Error('Analytics KPI metrics did not render on Dashboard.');
    }

    // 9.4 Test Users Tab & Suspend/Activate
    console.log('[9.4] Navigating to Users Tab...');
    const asideButtons = await page.$$('aside button');
    let usersTabClicked = false;
    for (const btn of asideButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('User Management')) {
        await btn.click();
        usersTabClicked = true;
        break;
      }
    }
    console.log(`Users tab button clicked via CDP: ${usersTabClicked}`);
    await new Promise(r => setTimeout(r, 2000));

    try {
      await page.waitForSelector('table', { timeout: 8000 });
    } catch (tblErr) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section9_table_error.png') });
      const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 500));
      console.error('Body snippet on table timeout:', bodySnippet);
      throw tblErr;
    }

    // Verify Users Table
    const usersTableCount = await page.evaluate(() => {
      const rows = document.querySelectorAll('tbody tr');
      return rows.length;
    });
    console.log(`Users rendered in table: ${usersTableCount}`);
    if (usersTableCount === 0) {
      throw new Error('User management table is empty.');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section9_users_management.png') });

    // Test toggle suspend on first user
    console.log('Testing Suspend / Activate toggle on user...');
    const toggleResult = await page.evaluate(async () => {
      const btns = Array.from(document.querySelectorAll('tbody button'));
      const toggle = btns.find(b => b.textContent.includes('Suspend') || b.textContent.includes('Activate'));
      if (toggle) {
        const prevText = toggle.textContent.trim();
        toggle.click();
        return { clicked: true, prevText };
      }
      return { clicked: false };
    });
    console.log(`User status toggle clicked:`, toggleResult);
    await new Promise(r => setTimeout(r, 1200));

    // 9.5 Test Master Inbox
    console.log('[9.5] Navigating to Master Inbox Tab...');
    const asideButtonsInbox = await page.$$('aside button');
    for (const btn of asideButtonsInbox) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Master Inbox')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section9_master_inbox.png') });

    // 9.6 Test Campaigns Tab & Campaign Creation
    console.log('[9.6] Navigating to Campaigns Tab...');
    const asideButtonsCamp = await page.$$('aside button');
    for (const btn of asideButtonsCamp) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Campaigns & Routing')) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1500));

    // Open New Campaign Modal
    console.log('Opening "+ Create Campaign" modal...');
    const createModalOpened = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const newCampBtn = btns.find(b => b.textContent.includes('Create Campaign'));
      if (newCampBtn) {
        newCampBtn.click();
        return true;
      }
      return false;
    });
    console.log(`Create Campaign modal triggered: ${createModalOpened}`);
    await page.waitForSelector('form', { timeout: 8000 });

    const campName = `QA Campaign ${Date.now().toString().slice(-4)}`;
    const utmTag = `qa_fb_${Date.now().toString().slice(-4)}`;

    // Fill campaign form
    console.log(`Filling new campaign: "${campName}" with UTM: "${utmTag}"...`);
    const nameInput = await page.waitForSelector('.modal-content input[placeholder*="UK Spring"]', { timeout: 5000 });
    await nameInput.type(campName);

    const utmInput = await page.waitForSelector('.modal-content input[placeholder*="uk_spring"]', { timeout: 5000 });
    await utmInput.type(utmTag);

    // Click submit button inside modal
    const submitBtn = await page.waitForSelector('.modal-content button[type="submit"]', { timeout: 5000 });
    await submitBtn.click();
    await new Promise(r => setTimeout(r, 2000));

    // Verify campaign created in DB
    const campInDb = await prisma.campaign.findFirst({
      where: { utmCampaign: utmTag }
    });
    console.log(`Campaign created in DB: id=${campInDb?.id}, name="${campInDb?.name}"`);
    if (!campInDb) {
      throw new Error('New campaign record was not found in database.');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section9_campaigns_list.png') });

    // 9.7 Security: Test Normal User Access Denied to Admin APIs
    console.log('[9.7] Testing Admin API access denial for unauthenticated/normal requests...');
    const securityCheck = await page.evaluate(async () => {
      const res = await fetch('/api/admin/users', {
        headers: { 'Cookie': '' },
        credentials: 'omit'
      });
      return { status: res.status, ok: res.ok };
    });
    console.log('Unauthenticated /api/admin/users status:', securityCheck);
    if (securityCheck.status !== 401 && securityCheck.status !== 403) {
      throw new Error(`Security violation: /api/admin/users returned status ${securityCheck.status} to unauthenticated caller!`);
    }

    if (consoleErrors.length > 0) {
      console.warn('Console errors detected:', consoleErrors);
      throw new Error(`Console errors found: ${consoleErrors.join(', ')}`);
    }

    console.log('\n>>> SECTION 9 RESULT: PASS ✅\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 9 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('section9.mjs')) {
  runSection9().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
