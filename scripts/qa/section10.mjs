import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

export async function runSection10() {
  console.log('\n==================================================');
  console.log('STARTING SECTION 10 — AGENT RBAC (BROWSER QA)');
  console.log('==================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('400') && !msg.text().includes('401') && !msg.text().includes('403')) {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    console.error('UNCAUGHT PAGE ERROR:', err.message);
    consoleErrors.push(err.message);
  });

  try {
    await page.setViewport({ width: 1366, height: 850 });

    // Step 0: Ensure Daniel Kim, Agent Sarah, and Agent Alex exist in DB
    const [sarah, alex, daniel] = await Promise.all([
      prisma.staffAccount.findUnique({ where: { email: 'sarah@heartlink.com' } }),
      prisma.staffAccount.findUnique({ where: { email: 'alex@heartlink.com' } }),
      prisma.user.findUnique({ where: { email: 'daniel.kim@example.com' } }),
    ]);

    if (!sarah || !alex || !daniel) {
      throw new Error(`Prerequisites missing: sarah=${!!sarah}, alex=${!!alex}, daniel=${!!daniel}`);
    }

    console.log(`Found staff & users: Sarah (${sarah.id}), Alex (${alex.id}), Daniel (${daniel.id})`);

    // Assign Daniel to Sarah initially
    await prisma.agentAssignment.updateMany({
      where: { userId: daniel.id },
      data: { status: 'removed' }
    });
    await prisma.agentAssignment.create({
      data: {
        userId: daniel.id,
        agentId: sarah.id,
        status: 'active',
        assignedBy: sarah.id,
        notes: 'Initial assignment to Sarah for QA test'
      }
    });
    console.log('Daniel Kim initially assigned to Agent Sarah.');

    // 10.1 Login as Agent Sarah
    console.log('[10.1] Logging into CRM as Agent Sarah (sarah@heartlink.com)...');
    await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });

    // Check if already logged in or on login screen
    const isAlreadyLoggedIn = await page.$('aside');
    if (isAlreadyLoggedIn) {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('header button'));
        const b = btns.find(el => el.textContent.includes('Agent Sarah'));
        if (b) b.click();
      });
    } else {
      const sarahBtn = await page.waitForSelector('button::-p-text(Sarah)', { timeout: 5000 });
      await sarahBtn.click();
    }

    await page.waitForFunction(
      () => document.querySelector('header')?.innerText.includes('Sarah Jenkins'),
      { timeout: 8000 }
    );
    console.log('Agent Sarah logged in successfully verified via header!');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section10_sarah_dashboard.png') });

    // Navigate to User Management
    console.log('Checking Sarah sees Daniel Kim in User Management...');
    const asideBtns = await page.$$('aside button');
    for (const btn of asideBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('User Management')) {
        await btn.click();
        break;
      }
    }
    await page.waitForSelector('table', { timeout: 8000 });
    await new Promise(r => setTimeout(r, 1000));

    // Verify Sarah sees Daniel
    const sarahUsersText = await page.evaluate(() => document.querySelector('table').innerText);
    const sarahSeesDaniel = sarahUsersText.includes('Daniel Kim') || sarahUsersText.includes('daniel.kim@example.com');
    console.log(`Sarah sees Daniel Kim: ${sarahSeesDaniel}`);
    if (!sarahSeesDaniel) {
      throw new Error('Agent Sarah cannot see her assigned user Daniel Kim in User Management.');
    }

    // 10.2 Verify Sarah is BLOCKED from admin-only routes server-side
    console.log('[10.2] Testing Sarah server-side access to admin-only APIs...');
    const sarahApiChecks = await page.evaluate(async () => {
      const results = {};
      const endpoints = ['/api/admin/agents', '/api/admin/campaigns', '/api/admin/assignments'];
      for (const ep of endpoints) {
        const res = await fetch(ep);
        results[ep] = res.status;
      }
      return results;
    });
    console.log('Sarah admin-only API access statuses:', sarahApiChecks);
    for (const [ep, status] of Object.entries(sarahApiChecks)) {
      if (status !== 403) {
        throw new Error(`Security violation: Agent Sarah accessed ${ep} with status ${status} instead of 403 Forbidden!`);
      }
    }

    // 10.3 Login as Agent Alex
    console.log('[10.3] Logging into CRM as Agent Alex (alex@heartlink.com)...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('header button'));
      const b = btns.find(el => el.textContent.includes('Agent Alex'));
      if (b) b.click();
    });

    // Wait explicitly for Alex Carter session to be reflected in header
    await page.waitForFunction(
      () => document.querySelector('header')?.innerText.includes('Alex Carter'),
      { timeout: 8000 }
    );
    console.log('Switched session to Agent Alex verified via header!');
    await new Promise(r => setTimeout(r, 1000));

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section10_alex_dashboard.png') });

    // Verify Alex DOES NOT see Daniel Kim in User Management
    console.log('Verifying Agent Alex CANNOT see Daniel Kim...');
    const alexTableText = await page.evaluate(() => document.querySelector('table')?.innerText || '');
    const alexSeesDaniel = alexTableText.includes('Daniel Kim') || alexTableText.includes('daniel.kim@example.com');
    console.log(`Alex sees Daniel Kim in table: ${alexSeesDaniel} (expected: false)`);
    if (alexSeesDaniel) {
      throw new Error('RBAC Leak: Agent Alex can see Daniel Kim who is assigned to Sarah!');
    }

    // 10.4 Admin Transfers Assignment: Sarah -> Alex
    console.log('[10.4] Switching to Super Admin to perform transfer...');
    const adminClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('header button'));
      const b = btns.find(el => el.textContent.trim() === 'Admin');
      if (b) {
        b.click();
        return true;
      }
      return false;
    });
    console.log('Admin persona switch button clicked:', adminClicked);

    await page.waitForFunction(
      () => {
        const text = document.querySelector('header')?.innerText || '';
        return text.includes('Super Admin') || text.includes('ADMIN');
      },
      { timeout: 8000 }
    );
    console.log('Switched session to Super Admin verified via header!');

    // In Admin User Management, find Daniel Kim and click "Assign"
    const adminAsideBtns = await page.$$('aside button');
    for (const btn of adminAsideBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('User Management')) {
        await btn.click();
        break;
      }
    }
    await page.waitForSelector('table', { timeout: 8000 });
    await new Promise(r => setTimeout(r, 1000));

    console.log('Locating Daniel Kim and clicking Assign button...');
    const assignClicked = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      for (const row of rows) {
        if (row.innerText.includes('Daniel Kim') || row.innerText.includes('daniel.kim@example.com')) {
          const btn = Array.from(row.querySelectorAll('button')).find(b => b.textContent.includes('Assign'));
          if (btn) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    });
    console.log(`Assign modal opened: ${assignClicked}`);
    if (!assignClicked) {
      throw new Error('Could not click Assign button for Daniel Kim.');
    }

    await page.waitForSelector('.modal-overlay', { timeout: 5000 });

    // Select Alex in the select dropdown and submit
    console.log('Selecting Agent Alex and confirming transfer...');
    await page.evaluate((alexId) => {
      const select = document.querySelector('.modal-content select');
      if (select) {
        select.value = alexId;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, alex.id);

    const notesInput = await page.$('.modal-content textarea');
    if (notesInput) {
      await notesInput.type('Reassigned from Sarah to Alex for QA verification');
    }

    const confirmBtn = await page.waitForSelector('.modal-content button[type="submit"]', { timeout: 5000 });
    await confirmBtn.click();
    await new Promise(r => setTimeout(r, 2000));

    // Verify DB assignment state
    const activeAssignment = await prisma.agentAssignment.findFirst({
      where: { userId: daniel.id, status: 'active' },
      include: { agent: true }
    });
    console.log(`Current active assignment in DB: agent=${activeAssignment?.agent?.displayName}`);
    if (activeAssignment?.agentId !== alex.id) {
      throw new Error(`Assignment transfer failed in DB: expected ${alex.id}, got ${activeAssignment?.agentId}`);
    }

    // Verify assignment history in DB
    const historyEntry = await prisma.assignmentHistory.findFirst({
      where: { userId: daniel.id, action: 'transferred' },
      orderBy: { performedAt: 'desc' }
    });
    console.log(`Transfer history recorded in DB: previous=${historyEntry?.previousAgentId}, new=${historyEntry?.newAgentId}`);
    if (!historyEntry || historyEntry.newAgentId !== alex.id) {
      throw new Error('Assignment history not properly recorded in DB.');
    }

    // 10.5 Verify Agent Sarah LOSES access and Agent Alex GAINS access
    console.log('[10.5] Verifying Sarah lost access and Alex gained access...');

    // Switch to Alex
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('header button'));
      const b = btns.find(el => el.textContent.includes('Agent Alex'));
      if (b) b.click();
    });
    await page.waitForFunction(
      () => document.querySelector('header')?.innerText.includes('Alex Carter'),
      { timeout: 8000 }
    );
    await new Promise(r => setTimeout(r, 1500));

    // Refresh Alex User Management table
    const alexTableTextAfter = await page.evaluate(() => document.querySelector('table')?.innerText || '');
    const alexNowSeesDaniel = alexTableTextAfter.includes('Daniel Kim') || alexTableTextAfter.includes('daniel.kim@example.com');
    console.log(`Alex now sees Daniel Kim: ${alexNowSeesDaniel} (expected: true)`);
    if (!alexNowSeesDaniel) {
      throw new Error('Agent Alex cannot see Daniel Kim after reassignment.');
    }

    // Switch to Sarah
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('header button'));
      const b = btns.find(el => el.textContent.includes('Agent Sarah'));
      if (b) b.click();
    });
    await page.waitForFunction(
      () => document.querySelector('header')?.innerText.includes('Sarah Jenkins'),
      { timeout: 8000 }
    );
    await new Promise(r => setTimeout(r, 1500));

    // Refresh Sarah User Management table
    const sarahTableTextAfter = await page.evaluate(() => document.querySelector('table')?.innerText || '');
    const sarahNowSeesDaniel = sarahTableTextAfter.includes('Daniel Kim') || sarahTableTextAfter.includes('daniel.kim@example.com');
    console.log(`Sarah still sees Daniel Kim: ${sarahNowSeesDaniel} (expected: false)`);
    if (sarahNowSeesDaniel) {
      throw new Error('RBAC Failure: Agent Sarah still sees Daniel Kim after transfer to Alex!');
    }

    if (consoleErrors.length > 0) {
      console.warn('Console errors detected:', consoleErrors);
      throw new Error(`Console errors found: ${consoleErrors.join(', ')}`);
    }

    console.log('\n>>> SECTION 10 RESULT: PASS ✅\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 10 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('section10.mjs')) {
  runSection10().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
