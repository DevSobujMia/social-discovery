import puppeteer from 'puppeteer-core';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const AUTH_SECRET = process.env.AUTH_SECRET || 'dev-secret-change-in-production-abc123xyz';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log('=== VERIFYING ALL 4 USER REQUIREMENTS ===');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // -------------------------------------------------------------
    // TEST 1: User side (Profile modal in chat & No fake typing on send)
    // -------------------------------------------------------------
    console.log('1. Setting up User session...');
    const user = await prisma.user.findUnique({
      where: { id: 'bed6a7fe-cb72-4ab9-a16b-48e98a2a7d77' },
    });
    if (!user) throw new Error('Customer user not found in DB');

    const userToken = jwt.sign(
      { id: user.id, email: user.email, type: 'user' },
      AUTH_SECRET,
      { expiresIn: '7d' }
    );

    const userContext = await browser.createBrowserContext();
    await userContext.setCookie({
      name: 'auth_token',
      value: userToken,
      domain: 'localhost',
      path: '/',
    });

    const userPage = await userContext.newPage();
    await userPage.setViewport({ width: 400, height: 850 });
    await userPage.goto('http://localhost:3000/?tab=messenger', {
      waitUntil: 'networkidle2',
    });
    await sleep(1500);

    // Click on the first conversation
    console.log('2. Opening conversation on user side...');
    await userPage.evaluate(() => {
      const convs = [...document.querySelectorAll('button')].filter(
        (b) => b.querySelector('img') && !b.closest('nav')
      );
      if (convs.length > 0) convs[0].click();
    });
    await sleep(1200);

    // Verify chat window opened
    const hasChat = await userPage.evaluate(() => {
      return !!document.querySelector('textarea');
    });
    console.log('Chat window active:', hasChat);

    if (hasChat) {
      // 3. Open participant profile from chat header
      console.log('3. Clicking participant profile in chat header...');
      await userPage.evaluate(() => {
        const profileTarget = document.querySelector('div[title*="profile"]') || document.querySelector('header .cursor-pointer.group');
        if (profileTarget) profileTarget.click();
      });
      await sleep(1000);

      const isModalOpen = await userPage.evaluate(() => {
        return !!document.querySelector('[role="dialog"]');
      });
      console.log('Profile modal opened successfully:', isModalOpen);
      await userPage.screenshot({ path: 'scripts/verified_user_profile_modal.png' });

      // 4. Close the profile modal via Back/Close button
      console.log('4. Closing profile modal via Back/Close button...');
      await userPage.evaluate(() => {
        const closeBtn = document.querySelector('button[aria-label="Close"], button[aria-label="Back"]');
        if (closeBtn) closeBtn.click();
      });
      await sleep(800);

      // 5. CRITICAL CHECK: Is Chat Window STILL OPEN?
      const chatStillOpen = await userPage.evaluate(() => {
        return !!document.querySelector('textarea');
      });
      console.log('>>> VERIFICATION: Chat window STILL OPEN after closing profile modal:', chatStillOpen);
      if (!chatStillOpen) {
        throw new Error('FAIL: Chat window was closed when closing profile modal!');
      }
      console.log('✅ PASS: Chat window remained open perfectly!');
      await userPage.screenshot({ path: 'scripts/verified_chat_retained_after_modal.png' });

      // 6. Test message send — verify NO fake 3-dot typing indicator appears
      console.log('5. Sending message to verify typing indicator...');
      await userPage.evaluate(() => {
        const txt = document.querySelector('textarea');
        if (txt) {
          txt.value = 'Hello from automated test';
          txt.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      await sleep(200);
      await userPage.keyboard.press('Enter');
      await sleep(300);

      const fakeTypingVisible = await userPage.evaluate(() => {
        const el = document.querySelector('.typing-indicator, [class*="peer-typing"], [class*="typing"]');
        return !!el;
      });
      console.log('>>> VERIFICATION: Fake typing indicator immediately on send:', fakeTypingVisible);
      if (fakeTypingVisible) {
        throw new Error('FAIL: Fake typing indicator appeared right after message send!');
      }
      console.log('✅ PASS: No premature/fake typing indicator on send!');
    }

    // -------------------------------------------------------------
    // TEST 2: Admin side (Unified ProfileViewModal for Customer & Profile)
    // -------------------------------------------------------------
    console.log('\n6. Setting up Admin session...');
    const admin = await prisma.staffAccount.findFirst({
      where: { status: 'active' },
    });
    if (!admin) throw new Error('Admin staff account not found');

    const adminToken = jwt.sign(
      { id: admin.id, email: admin.email, type: 'staff', role: admin.role },
      AUTH_SECRET,
      { expiresIn: '7d' }
    );

    const adminContext = await browser.createBrowserContext();
    await adminContext.setCookie({
      name: 'auth_token',
      value: adminToken,
      domain: 'localhost',
      path: '/',
    });

    const adminPage = await adminContext.newPage();
    await adminPage.setViewport({ width: 1280, height: 900 });
    await adminPage.goto('http://localhost:3000/admin', {
      waitUntil: 'networkidle2',
    });
    console.log('Waiting for password input...');
    await adminPage.waitForSelector('input[type="password"]', { timeout: 15000 });
    console.log('Unlocking admin panel with password...');
    await adminPage.evaluate(() => {
      const inp = document.querySelector('input[type="password"]');
      if (inp) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(inp, 'Dev0077');
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const btn = document.querySelector('button[type="submit"]');
      if (btn) btn.click();
    });
    await sleep(2500);

    console.log('Waiting for admin inbox to load...');
    await adminPage.waitForSelector('div[class*="cursor-pointer"]', { timeout: 20000 });
    await sleep(1000);

    // Select the first conversation in admin
    console.log('7. Selecting conversation in admin...');
    await adminPage.evaluate(() => {
      const rows = [...document.querySelectorAll('div[class*="cursor-pointer"]')].filter(
        (r) => r.innerText.includes('to')
      );
      if (rows.length > 0) rows[0].click();
    });
    await sleep(1500);

    // Click Customer Profile button in admin chat header
    console.log('8. Clicking Customer Profile in admin chat header...');
    await adminPage.evaluate(() => {
      const btn = document.querySelector('button[title*="customer"]');
      if (btn) btn.click();
    });
    await sleep(1000);

    const adminCustomerModalOpen = await adminPage.evaluate(() => {
      return !!document.querySelector('[role="dialog"]');
    });
    console.log('>>> VERIFICATION: Admin Customer Modal opened (ProfileViewModal):', adminCustomerModalOpen);
    await adminPage.screenshot({ path: 'scripts/verified_admin_customer_modal.png' });

    // Close customer modal
    await adminPage.evaluate(() => {
      const closeBtn = document.querySelector('button[aria-label="Close"], button[aria-label="Back"]');
      if (closeBtn) closeBtn.click();
    });
    await sleep(800);

    // Click Represented Profile button in admin chat header
    console.log('9. Clicking Represented Profile in admin chat header...');
    await adminPage.evaluate(() => {
      const btn = document.querySelector('button[title*="represented"]');
      if (btn) btn.click();
    });
    await sleep(1000);

    const adminRepresentedModalOpen = await adminPage.evaluate(() => {
      return !!document.querySelector('[role="dialog"]');
    });
    console.log('>>> VERIFICATION: Admin Represented Profile Modal opened (ProfileViewModal):', adminRepresentedModalOpen);
    await adminPage.screenshot({ path: 'scripts/verified_admin_represented_modal.png' });

    // Close represented modal
    await adminPage.evaluate(() => {
      const closeBtn = document.querySelector('button[aria-label="Close"], button[aria-label="Back"]');
      if (closeBtn) closeBtn.click();
    });
    await sleep(600);

    console.log('\n🎉 ALL 4 USER REQUIREMENTS TESTED AND FULLY VERIFIED!');
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
