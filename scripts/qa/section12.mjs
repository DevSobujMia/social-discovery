import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

export async function runSection12() {
  console.log('\n==================================================');
  console.log('STARTING SECTION 12 — MOBILE HUMAN QA (BROWSER QA)');
  console.log('==================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    // Standard modern mobile viewport (iPhone 14 / modern flagship)
    await page.setViewport({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('400') && !msg.text().includes('401')) {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      consoleErrors.push(err.message);
    });

    // Helper: Check horizontal overflow
    const checkOverflow = async (stepName) => {
      const overflow = await page.evaluate(() => {
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
      });
      console.log(`[Overflow Check - ${stepName}]: scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}, overflow=${overflow.hasOverflow}`);
      if (overflow.hasOverflow) {
        throw new Error(`Mobile Horizontal Overflow detected on ${stepName}: scrollWidth (${overflow.scrollWidth}) > clientWidth (${overflow.clientWidth})!`);
      }
    };

    // 12.1 Mobile Landing & Discover
    console.log('[12.1] Navigating to Landing/Discover on mobile (390x844)...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1200));

    await checkOverflow('Landing / Discover');

    // Verify cards rendered
    await page.waitForSelector('.group.glass-card', { timeout: 8000 });
    const cardCount = await page.evaluate(() => document.querySelectorAll('.group.glass-card').length);
    console.log(`Mobile profile cards rendered: ${cardCount}`);
    if (cardCount === 0) throw new Error('No profile cards rendered on mobile viewport.');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section12_mobile_discover.png') });

    // 12.2 Mobile Profile Bio Modal
    console.log('[12.2] Testing Profile Bio modal on mobile...');
    const viewBioClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const bioBtn = btns.find(b => b.textContent.includes('View Bio') || b.textContent.includes('Bio'));
      if (bioBtn) {
        bioBtn.click();
        return true;
      }
      return false;
    });
    console.log(`Mobile View Bio clicked: ${viewBioClicked}`);
    if (viewBioClicked) {
      await page.waitForSelector('.modal-overlay', { timeout: 5000 });
      await checkOverflow('Bio Modal');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section12_mobile_bio_modal.png') });

      // Close modal
      await page.evaluate(() => {
        const closeBtn = document.querySelector('.modal-overlay button');
        if (closeBtn) closeBtn.click();
      });
      await page.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 5000 });
      console.log('Mobile Bio modal closed successfully.');
    }

    // 12.3 Mobile Login as Test User Daniel Kim
    console.log('[12.3] Testing Mobile Login...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signBtn) signBtn.click();
    });
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });
    await checkOverflow('Auth Modal');

    // Fill in credentials as real human on mobile
    const emailInput = await page.waitForSelector('.modal-overlay input[type="email"]', { timeout: 4000 });
    await emailInput.type('daniel.kim@example.com');
    const pwdInput = await page.$('.modal-overlay input[type="password"]');
    await pwdInput.type('User@123456');

    const submitBtn = await page.$('.modal-overlay button[type="submit"]');
    await submitBtn.click();
    await page.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 10000 });
    console.log('Mobile login successful as Daniel Kim.');

    // 12.4 Mobile Profile View & Navigation
    console.log('[12.4] Navigating to Profile tab via mobile bottom bar...');
    const profileTabClicked = await page.evaluate(() => {
      const navBtns = Array.from(document.querySelectorAll('nav button'));
      const profBtn = navBtns.find(b => b.textContent.includes('Profile'));
      if (profBtn) {
        profBtn.click();
        return true;
      }
      return false;
    });
    console.log(`Profile tab clicked: ${profileTabClicked}`);
    await new Promise(r => setTimeout(r, 1000));
    await checkOverflow('Profile Tab');

    // Verify Daniel's profile details display cleanly on mobile
    const profileText = await page.evaluate(() => document.body.innerText);
    const hasDanielName = profileText.includes('Daniel Kim');
    console.log(`Profile tab displays Daniel Kim: ${hasDanielName}`);
    if (!hasDanielName) throw new Error('Daniel Kim not visible in mobile profile tab.');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section12_mobile_profile.png') });

    // 12.5 Mobile Like / Connect Action
    console.log('[12.5] Switching back to Discover tab and performing Like action...');
    await page.evaluate(() => {
      const navBtns = Array.from(document.querySelectorAll('nav button'));
      const discBtn = navBtns.find(b => b.textContent.includes('Discover'));
      if (discBtn) discBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Like first visible card on mobile
    const liked = await page.evaluate(() => {
      const likeBtns = Array.from(document.querySelectorAll('button')).filter(b => 
        b.className.includes('bg-brand-500') || b.querySelector('svg.text-white') || b.title === 'Like'
      );
      if (likeBtns.length > 0) {
        likeBtns[0].click();
        return true;
      }
      return false;
    });
    console.log(`Mobile Like action triggered: ${liked}`);

    // 12.6 Mobile Messenger & Real-Time Chat
    console.log('[12.6] Navigating to Messenger tab via mobile bottom nav...');
    await page.evaluate(() => {
      const navBtns = Array.from(document.querySelectorAll('nav button'));
      const msgBtn = navBtns.find(b => b.textContent.includes('Messenger'));
      if (msgBtn) msgBtn.click();
    });
    await page.waitForSelector('.divide-y button', { timeout: 8000 });
    await checkOverflow('Messenger List');

    // Select conversation in mobile list
    const convBtns = await page.$$('.divide-y button');
    if (convBtns.length === 0) {
      throw new Error('No conversation item found in Messenger list to open.');
    }
    await convBtns[0].click();
    console.log('Mobile conversation clicked successfully.');

    await new Promise(r => setTimeout(r, 1200));
    await checkOverflow('Mobile Active Chat View');

    // Send mobile chat message
    const mobileMsgText = `Mobile test message from iPhone viewport! 📱 ✨ ${Date.now().toString().slice(-4)}`;
    console.log(`Typing mobile message: "${mobileMsgText}"...`);

    const chatInput = await page.waitForSelector('input[placeholder*="Write a message"]', { timeout: 6000 });
    await chatInput.type(mobileMsgText);

    const sendBtn = await page.waitForSelector('button[type="submit"]', { timeout: 5000 });
    await sendBtn.click();
    await new Promise(r => setTimeout(r, 1500));

    // Verify message appears in message thread
    const msgRendered = await page.evaluate((text) => document.body.innerText.includes(text), mobileMsgText);
    console.log(`Mobile sent message rendered in chat bubble: ${msgRendered}`);
    if (!msgRendered) {
      throw new Error('Message not found in chat bubble after sending on mobile viewport.');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'section12_mobile_chat.png') });

    if (consoleErrors.length > 0) {
      console.warn('Console errors on mobile:', consoleErrors);
      throw new Error(`Console errors found on mobile: ${consoleErrors.join(', ')}`);
    }

    await context.close();

    console.log('\n>>> SECTION 12 RESULT: PASS ✅\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 12 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('section12.mjs')) {
  runSection12().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
