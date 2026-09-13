import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\screenshots';

export async function runSection7() {
  console.log('\n==================================================');
  console.log('STARTING SECTION 7 — MESSENGER (BROWSER QA)');
  console.log('==================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const consoleErrors = [];
  const networkErrors = [];

  try {
    // Session 1: Daniel Kim
    console.log('[7.1] Opening Session 1 as Daniel Kim...');
    const pageA = await browser.newPage();
    await pageA.setViewport({ width: 1280, height: 800 });

    pageA.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('400') && !msg.text().includes('401')) {
        consoleErrors.push(`[Session A] ${msg.text()}`);
      }
    });

    await pageA.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // Login Daniel
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await pageA.waitForSelector('.modal-overlay', { timeout: 5000 });
    await pageA.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.modal-overlay button'));
      const danielBtn = btns.find(b => b.textContent.includes('Daniel Kim'));
      if (danielBtn) danielBtn.click();
    });
    await pageA.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });

    // Session 2: Aisha Rahman (Incognito Context)
    console.log('[7.2] Opening Session 2 as Aisha Rahman in separate context...');
    const contextB = await browser.createBrowserContext();
    const pageB = await contextB.newPage();
    await pageB.setViewport({ width: 1280, height: 800 });

    pageB.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('400') && !msg.text().includes('401')) {
        consoleErrors.push(`[Session B] ${msg.text()}`);
      }
    });

    await pageB.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // Login Aisha
    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await pageB.waitForSelector('.modal-overlay', { timeout: 5000 });
    await pageB.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.modal-overlay button'));
      const aishaBtn = btns.find(b => b.textContent.includes('Aisha Rahman'));
      if (aishaBtn) aishaBtn.click();
    });
    await pageB.waitForFunction(() => !document.querySelector('.modal-overlay'), { timeout: 8000 });

    // 7.3 Navigate Daniel to Messenger
    console.log('[7.3] Daniel navigating to Messenger...');
    await pageA.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button'));
      const msgTab = tabs.find(b => b.textContent.includes('Messenger'));
      if (msgTab) msgTab.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    // Select Aisha in conversation list
    await pageA.evaluate(() => {
      const convButtons = Array.from(document.querySelectorAll('button'));
      const aishaConv = convButtons.find(b => b.textContent.includes('Aisha'));
      if (aishaConv) aishaConv.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // 7.4 Test Empty message prevention
    console.log('[7.4] Testing empty message handling...');
    const sendDisabled = await pageA.evaluate(() => {
      const sendBtn = document.querySelector('form button[type="submit"]');
      return sendBtn ? sendBtn.disabled : false;
    });
    console.log(`Send button disabled on empty input: ${sendDisabled}`);
    if (!sendDisabled) {
      throw new Error('Send button should be disabled when chat input is empty.');
    }

    // 7.5 Daniel sends message to Aisha
    const msg1Text = `Hello Aisha! Testing real browser chat at ${Date.now()}`;
    console.log(`[7.5] Daniel typing message: "${msg1Text}"...`);
    await pageA.type('input[placeholder*="Write a message"]', msg1Text);
    await pageA.click('form button[type="submit"]');
    await new Promise(r => setTimeout(r, 1200));

    // Verify message appears in Daniel's chat
    const danielSeesSent = await pageA.evaluate((text) => {
      return document.body.innerText.includes(text);
    }, msg1Text);
    console.log(`Daniel sees sent message bubble: ${danielSeesSent}`);
    if (!danielSeesSent) {
      throw new Error('Sent message did not appear in sender UI.');
    }

    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'section7_daniel_sent_msg.png') });

    // 7.6 Aisha opens Messenger and receives message via polling
    console.log('[7.6] Aisha opening Messenger to receive message...');
    await pageB.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button'));
      const msgTab = tabs.find(b => b.textContent.includes('Messenger'));
      if (msgTab) msgTab.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Select Daniel in Aisha's conversation list
    await pageB.evaluate(() => {
      const convButtons = Array.from(document.querySelectorAll('button'));
      const danielConv = convButtons.find(b => b.textContent.includes('Daniel'));
      if (danielConv) danielConv.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Poll for message in Aisha's chat
    console.log('Waiting for message to appear in Aisha chat view...');
    await pageB.waitForFunction((text) => document.body.innerText.includes(text), { timeout: 8000 }, msg1Text);
    console.log('Aisha successfully received Daniel\'s message in real browser!');

    await pageB.screenshot({ path: path.join(SCREENSHOT_DIR, 'section7_aisha_received_msg.png') });

    // 7.7 Aisha replies to Daniel
    const replyText = `Hey Daniel! Received your message loud and clear! Reply at ${Date.now()}`;
    console.log(`[7.7] Aisha replying: "${replyText}"...`);
    await pageB.type('input[placeholder*="Write a message"]', replyText);
    await pageB.click('form button[type="submit"]');
    await new Promise(r => setTimeout(r, 1200));

    // 7.8 Daniel receives Aisha's reply via 3s PostgreSQL polling interval
    console.log('[7.8] Waiting for Daniel to receive Aisha\'s reply via polling...');
    await pageA.waitForFunction((text) => document.body.innerText.includes(text), { timeout: 10000 }, replyText);
    console.log('Daniel successfully received Aisha\'s reply in real browser!');

    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'section7_daniel_received_reply.png') });

    // 7.9 Test Long Message formatting
    const longMsg = 'This is a long formatted message to test multi-line chat bubbles. It includes emojis 🚀❤️✨, punctuation, and extensive detail ensuring no text wrapping bugs, container clipping, or layout breakage occur in either desktop or mobile viewport modes.';
    console.log('[7.9] Testing long message rendering...');
    await pageA.type('input[placeholder*="Write a message"]', longMsg);
    await pageA.click('form button[type="submit"]');
    await new Promise(r => setTimeout(r, 1500));

    await pageB.waitForFunction((text) => document.body.innerText.includes(text.substring(0, 30)), { timeout: 8000 }, longMsg);
    console.log('Long message delivered and verified.');

    // 7.10 Test Navigate away and return (tab persistence)
    console.log('[7.10] Testing navigation away to Discover and return to Messenger...');
    await pageA.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button'));
      const discTab = tabs.find(b => b.textContent.includes('Discover'));
      if (discTab) discTab.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Return to Messenger
    await pageA.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('header button, nav button'));
      const msgTab = tabs.find(b => b.textContent.includes('Messenger'));
      if (msgTab) msgTab.click();
    });
    await new Promise(r => setTimeout(r, 1200));
    const historyPreserved = await pageA.evaluate((text) => document.body.innerText.includes(text), replyText);
    console.log(`Chat history preserved upon return: ${historyPreserved}`);
    if (!historyPreserved) {
      throw new Error('Chat history was lost upon navigating back to Messenger.');
    }

    // 7.11 Test Mobile Chat Layout (390x844)
    console.log('[7.11] Testing Mobile chat layout (390x844)...');
    await pageA.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await new Promise(r => setTimeout(r, 600));

    // Check back arrow button on mobile chat header
    const mobileBackBtn = await pageA.evaluate(() => {
      const back = document.querySelector('header button svg.lucide-chevron-left, button svg.lucide-chevron-left');
      return back !== null;
    });
    console.log(`Mobile chat header back arrow button present: ${mobileBackBtn}`);

    await pageA.screenshot({ path: path.join(SCREENSHOT_DIR, 'section7_mobile_chat.png') });

    // Verify zero console errors
    if (consoleErrors.length > 0) {
      console.warn('Console errors detected:', consoleErrors);
      throw new Error(`Console errors found: ${consoleErrors.join(', ')}`);
    }

    console.log('\n>>> SECTION 7 RESULT: PASS ✅\n');
    return { status: 'PASS' };
  } catch (err) {
    console.error('\n>>> SECTION 7 RESULT: FAIL ❌', err);
    return { status: 'FAIL', error: err.message };
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('section7.mjs')) {
  runSection7().then(res => {
    if (res.status === 'FAIL') process.exit(1);
  });
}
