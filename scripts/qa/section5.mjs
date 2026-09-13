import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

export async function runSection5() {
  console.log('\n==================================================');
  console.log('STARTING SECTION 5 — LIKE / PASS / CONNECT (BROWSER QA)');
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
    if (msg.type() === 'error') {
      if (msg.text().includes('400') || msg.text().includes('401')) return;
      consoleErrors.push(msg.text());
    }
  });

  page.on('response', response => {
    if (!response.ok() && response.status() !== 304 && !response.url().includes('favicon.ico')) {
      networkErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // 5.1 Login as User A (Daniel Kim)
    console.log('[5.1] Logging in as User A (Daniel Kim)...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.modal-overlay button'));
      const danielBtn = btns.find(b => b.textContent.includes('Daniel Kim'));
      if (danielBtn) danielBtn.click();
    });
    await page.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });
    console.log('User A (Daniel Kim) logged in.');

    await new Promise(r => setTimeout(r, 1000));

    // 5.2 Find target profile card (e.g. Elena or Aisha or first card)
    console.log('[5.2] Locating first profile card in Discover feed...');
    await page.waitForSelector('.group.glass-card', { timeout: 8000 });

    const targetInfo = await page.evaluate(() => {
      const firstCard = document.querySelector('.group.glass-card');
      const name = firstCard?.querySelector('h2')?.innerText;
      return { name };
    });
    console.log(`Target profile card: "${targetInfo.name}"`);

    // 5.3 Click Like button on first card
    console.log('[5.3] Clicking Like button on target profile...');
    await page.evaluate(() => {
      const firstCard = document.querySelector('.group.glass-card');
      const likeBtn = firstCard?.querySelector('button[title*="Like"]');
      if (likeBtn) likeBtn.click();
    });

    await new Promise(r => setTimeout(r, 1200));

    // Verify UI response toast / notice
    const toastMessage = await page.evaluate(() => {
      const toast = document.querySelector('.bg-surface-900\\/90');
      return toast ? toast.innerText : document.body.innerText;
    });
    const likeToastConfirmed = toastMessage.includes('Liked!') || toastMessage.includes('match') || toastMessage.includes('Match');
    console.log(`UI Toast feedback after Like: confirmed = ${likeToastConfirmed}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section5_like_action.png') });

    // 5.4 Test Pass action on a second profile card
    console.log('[5.4] Testing Pass action on second profile card...');
    await page.evaluate(() => {
      const cards = document.querySelectorAll('.group.glass-card');
      if (cards.length > 1) {
        const passBtn = cards[1].querySelector('button[title*="Pass"]');
        if (passBtn) passBtn.click();
      }
    });

    await new Promise(r => setTimeout(r, 1200));
    const passToast = await page.evaluate(() => {
      return document.body.innerText.includes('Passed to next') || document.body.innerText.includes('Passed');
    });
    console.log(`Pass action feedback displayed: ${passToast}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section5_pass_action.png') });

    // 5.5 Verify Database State
    console.log('[5.5] Verifying database records for interactions...');
    const daniel = await prisma.user.findUnique({
      where: { email: 'daniel.kim@example.com' },
      include: { sentInteractions: { orderBy: { createdAt: 'desc' }, take: 5 } }
    });

    console.log(`Daniel sentInteractions count in DB: ${daniel.sentInteractions.length}`);
    const hasLike = daniel.sentInteractions.some(i => i.type === 'like');
    const hasPass = daniel.sentInteractions.some(i => i.type === 'pass');
    console.log(`Database has 'like' interaction: ${hasLike}`);
    console.log(`Database has 'pass' interaction: ${hasPass}`);

    if (!hasLike) {
      throw new Error('Database does not contain expected "like" interaction from Daniel Kim.');
    }

    // 5.6 Test Refresh after interaction
    console.log('[5.6] Testing page refresh after interaction...');
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));
    const cardsAfterReload = await page.$$eval('.group.glass-card', elms => elms.length);
    console.log(`Cards visible after reload: ${cardsAfterReload}`);
    if (cardsAfterReload === 0) {
      throw new Error('Cards failed to render after page reload.');
    }

    if (consoleErrors.length > 0) {
      console.warn('Console errors detected:', consoleErrors);
      throw new Error(`Console errors found: ${consoleErrors.join(', ')}`);
    }

    console.log('\n>>> SECTION 5 RESULT: PASS ✅\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 5 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('section5.mjs')) {
  runSection5().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
