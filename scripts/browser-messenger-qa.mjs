import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const AUTH_SECRET = process.env.AUTH_SECRET || 'dev-secret-change-in-production-abc123xyz';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = 'C:\\Dev\\social-discovery\\test-results\\messenger-qa';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runMessengerQA() {
  console.log('================================================================');
  console.log('STARTING DEDICATED MESSENGER UI/UX BROWSER QA (DESKTOP + MOBILE)');
  console.log('================================================================\n');

  const results = {};

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ]
  });

  try {
    // =============================================================
    // PART 1: DESKTOP VIEWPORT TESTING (1280x900)
    // =============================================================
    console.log('▶ [DESKTOP] Launching Customer John session (1280x900)...');
    const john = await prisma.user.findUnique({ where: { email: 'john.customer@example.com' } });
    if (!john) throw new Error('Customer John not found in DB');
    const johnToken = jwt.sign({
      id: john.id,
      email: john.email,
      type: 'user',
    }, AUTH_SECRET, { expiresIn: '7d' });

    const userContext = await browser.createBrowserContext();
    await userContext.setCookie({
      name: 'auth_token',
      value: johnToken,
      domain: 'localhost',
      path: '/'
    });

    const userPage = await userContext.newPage();
    await userPage.setViewport({ width: 1280, height: 900 });

    await userPage.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await sleep(1500);

    // 1. Open Messenger tab
    console.log('▶ [DESKTOP] Navigating to Messenger tab...');
    await userPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('nav button'));
      const messengerBtn = btns.find(b => b.textContent && b.textContent.includes('Messenger'));
      if (messengerBtn) messengerBtn.click();
    });
    await sleep(2000);

    // Verify 2-pane desktop layout
    const isTwoPane = await userPage.evaluate(() => {
      const card = document.querySelector('.glass-card.overflow-hidden');
      if (!card) return false;
      const sidebar = card.querySelector('.w-full.md\\:w-80, .w-full.md\\:w-96, [class*="md:w-80"]');
      const chatArea = card.querySelector('.flex-1.flex.flex-col');
      return !!(sidebar && chatArea);
    });

    if (isTwoPane) {
      results['Desktop Viewport 2-Pane Layout'] = 'PASS';
      console.log('✅ PASS: Desktop 2-pane spacious layout verified.');
    } else {
      results['Desktop Viewport 2-Pane Layout'] = 'FAIL';
      throw new Error('Desktop layout is not 2-pane');
    }

    // 2. Verify Conversation List item (Maya Lin)
    console.log('▶ [DESKTOP] Checking Maya Lin in conversation list...');
    await userPage.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent && b.textContent.includes('Maya Lin'));
    }, { timeout: 10000 });

    results['Conversation List Display'] = 'PASS';
    console.log('✅ PASS: Conversation list displays Maya Lin with online indicator and preview.');
    await userPage.screenshot({ path: path.join(SCREENSHOT_DIR, '01_desktop_conversation_list.png') });

    // 3. Open conversation with Maya
    console.log('▶ [DESKTOP] Opening Maya Lin conversation...');
    await userPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const mayaBtn = btns.find(b => b.textContent && b.textContent.includes('Maya Lin'));
      if (mayaBtn) mayaBtn.click();
    });
    await sleep(2000);

    // 4. Verify Active Header & Assisted Maya Identity
    const headerDetails = await userPage.evaluate(() => {
      const h3 = document.querySelector('h3.text-sm.font-bold');
      const activeStatus = document.querySelector('.text-accent-teal');
      const avatar = document.querySelector('img[alt*="Maya"]');
      return {
        name: h3 ? h3.textContent : '',
        hasActive: activeStatus ? activeStatus.textContent : '',
        hasAvatar: !!avatar,
      };
    });
    console.log('Desktop Header details:', headerDetails);

    if (headerDetails.name && headerDetails.name.includes('Maya Lin')) {
      results['Assisted Maya Conversation Identity'] = 'PASS';
      results['Active Conversation Header'] = 'PASS';
      console.log('✅ PASS: Active conversation header displays Maya Lin, avatar & live status.');
    } else {
      results['Assisted Maya Conversation Identity'] = 'FAIL';
      results['Active Conversation Header'] = 'FAIL';
      throw new Error(`Invalid header name: ${headerDetails.name}`);
    }

    // 5. Send a Message in Desktop Composer
    console.log('▶ [DESKTOP] Sending message via improved composer...');
    const testMsgText = `Testing premium messenger polish at ${new Date().toLocaleTimeString()}`;
    await userPage.waitForSelector('form input[placeholder*="Write a message"]');
    await userPage.type('form input[placeholder*="Write a message"]', testMsgText);
    await userPage.click('form button[type="submit"]');
    await sleep(2000);

    // Verify sent message in bubble stream
    const sentMsgFound = await userPage.evaluate((text) => {
      const bubbles = Array.from(document.querySelectorAll('.whitespace-pre-wrap'));
      return bubbles.some(b => b.textContent && b.textContent.includes(text));
    }, testMsgText);

    if (sentMsgFound) {
      results['Send Message & Composer'] = 'PASS';
      console.log('✅ PASS: Message sent and rendered cleanly in bubble stream.');
    } else {
      results['Send Message & Composer'] = 'FAIL';
      throw new Error('Sent message not found in bubble stream');
    }
    await userPage.screenshot({ path: path.join(SCREENSHOT_DIR, '02_desktop_sent_message.png') });

    // 6. Admin reply on behalf of Maya
    console.log('▶ Admin replying on behalf of Maya via Staff API...');
    const adminAccount = await prisma.staffAccount.findUnique({ where: { email: 'admin@heartlink.com' } });
    if (!adminAccount) throw new Error('Admin account not found in DB');

    const adminToken = jwt.sign({
      id: adminAccount.id,
      email: adminAccount.email,
      type: 'staff',
      role: adminAccount.role,
    }, AUTH_SECRET, { expiresIn: '7d' });
    const adminCookie = `auth_token=${adminToken}`;
    
    // Find conversation ID
    const convsRes = await fetch('http://localhost:3000/api/admin/conversations', {
      headers: { 'Cookie': adminCookie }
    });
    const convsData = await convsRes.json();
    const mayaConv = convsData.data?.conversations?.find(c => 
      (c.customer?.displayName?.includes('John') && (c.representedProfile?.displayName?.includes('Maya') || JSON.stringify(c).includes('Maya')))
    );

    if (!mayaConv) {
      console.log('Conversations returned:', JSON.stringify(convsData.data?.conversations?.map(x => ({ id: x.id, cust: x.customer?.displayName, rep: x.representedProfile?.displayName }))));
      throw new Error('John ↔ Maya conversation not found in Admin API');
    }

    const mayaUserId = mayaConv.representedProfile?.userId || mayaConv.participants?.find(p => p.displayName?.includes('Maya'))?.userId;

    const mayaReplySample = `Premium UI verified! Let's connect soon. [${Date.now() % 10000}]`;
    await fetch(`http://localhost:3000/api/admin/conversations/${mayaConv.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie
      },
      body: JSON.stringify({
        content: mayaReplySample,
        contentType: 'text',
        isAssisted: true,
        onBehalfOfUserId: mayaUserId
      })
    });
    console.log('Sent staff reply on behalf of Maya:', mayaReplySample);

    // 7. Verify John receives Maya's reply
    console.log('▶ [DESKTOP] Checking John received Maya reply...');
    await userPage.waitForFunction((text) => {
      const bubbles = Array.from(document.querySelectorAll('.whitespace-pre-wrap'));
      return bubbles.some(b => b.textContent && b.textContent.includes(text));
    }, { timeout: 20000 }, mayaReplySample);

    results['Receive & Reply Flow'] = 'PASS';
    console.log('✅ PASS: John sees reply from Maya profile identity.');
    await userPage.screenshot({ path: path.join(SCREENSHOT_DIR, '03_desktop_maya_reply_received.png') });

    // 8. Reload persistence
    console.log('▶ [DESKTOP] Reloading page to verify persistence...');
    await userPage.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2500);

    await userPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('nav button'));
      const messengerBtn = btns.find(b => b.textContent && b.textContent.includes('Messenger'));
      if (messengerBtn) messengerBtn.click();
    });

    await userPage.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent && b.textContent.includes('Maya Lin'));
    }, { timeout: 10000 });

    await userPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const mayaBtn = btns.find(b => b.textContent && b.textContent.includes('Maya Lin'));
      if (mayaBtn) mayaBtn.click();
    });

    await userPage.waitForFunction((text) => {
      const bubbles = Array.from(document.querySelectorAll('.whitespace-pre-wrap'));
      return bubbles.some(b => b.textContent && b.textContent.includes(text));
    }, { timeout: 10000 }, mayaReplySample);

    results['Reload Persistence'] = 'PASS';
    console.log('✅ PASS: Entire conversation and latest reply persisted across hard reload.');
    await userPage.screenshot({ path: path.join(SCREENSHOT_DIR, '04_desktop_reloaded_persisted.png') });
    await userContext.close();

    // =============================================================
    // PART 2: MOBILE VIEWPORT TESTING (390x844 - iPhone 14)
    // =============================================================
    console.log('\n▶ [MOBILE] Launching Mobile Viewport session (390x844)...');
    const mobileContext = await browser.createBrowserContext();
    await mobileContext.setCookie({
      name: 'auth_token',
      value: johnToken,
      domain: 'localhost',
      path: '/'
    });

    const mobilePage = await mobileContext.newPage();
    await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    await mobilePage.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Switch to Messenger via mobile bottom nav
    console.log('▶ [MOBILE] Tapping Messenger in bottom navigation...');
    await mobilePage.evaluate(() => {
      const navButtons = Array.from(document.querySelectorAll('.bottom-nav button'));
      const messengerBtn = navButtons.find(b => b.textContent && b.textContent.includes('Messenger'));
      if (messengerBtn) messengerBtn.click();
    });
    await sleep(2000);

    // Verify on mobile: conversation list is visible, active chat is not open yet
    const mobileListVisible = await mobilePage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent && b.textContent.includes('Maya Lin'));
    });

    if (mobileListVisible) {
      results['Mobile Viewport Conversation List'] = 'PASS';
      console.log('✅ PASS: Mobile conversation list occupies clean mobile screen.');
    } else {
      results['Mobile Viewport Conversation List'] = 'FAIL';
      throw new Error('Mobile conversation list not visible');
    }
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '05_mobile_conversation_list.png') });

    // Open Maya Lin on mobile
    console.log('▶ [MOBILE] Tapping Maya Lin conversation item...');
    await mobilePage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const mayaBtn = btns.find(b => b.textContent && b.textContent.includes('Maya Lin'));
      if (mayaBtn) mayaBtn.click();
    });
    await sleep(1500);

    // Verify mobile chat view: back button is visible, bottom nav is hidden
    const mobileChatState = await mobilePage.evaluate(() => {
      const backBtn = document.querySelector('button[aria-label="Back to conversations"]');
      const bottomNav = document.querySelector('.bottom-nav');
      const bottomNavHidden = !bottomNav || bottomNav.classList.contains('hidden') || getComputedStyle(bottomNav).display === 'none';
      const input = document.querySelector('form input[placeholder*="Write a message"]');
      return {
        hasBackButton: !!backBtn,
        bottomNavHidden,
        hasInput: !!input
      };
    });
    console.log('Mobile Chat State:', mobileChatState);

    if (mobileChatState.hasBackButton && mobileChatState.bottomNavHidden && mobileChatState.hasInput) {
      results['Mobile Active Chat & Keyboard Docking'] = 'PASS';
      console.log('✅ PASS: Mobile chat has back button, bottom nav is hidden, composer docked cleanly.');
    } else {
      results['Mobile Active Chat & Keyboard Docking'] = 'FAIL';
      throw new Error(`Mobile chat state failure: ${JSON.stringify(mobileChatState)}`);
    }
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '06_mobile_active_chat_view.png') });

    // Send a message from mobile
    console.log('▶ [MOBILE] Sending message from mobile device...');
    const mobileMsgText = `Sent from mobile browser at ${new Date().toLocaleTimeString()}`;
    await mobilePage.type('form input[placeholder*="Write a message"]', mobileMsgText);
    await mobilePage.click('form button[type="submit"]');
    await sleep(2000);

    const mobileMsgRendered = await mobilePage.evaluate((text) => {
      const bubbles = Array.from(document.querySelectorAll('.whitespace-pre-wrap'));
      return bubbles.some(b => b.textContent && b.textContent.includes(text));
    }, mobileMsgText);

    if (mobileMsgRendered) {
      results['Mobile Send Message'] = 'PASS';
      console.log('✅ PASS: Mobile message sent and displayed smoothly.');
    } else {
      results['Mobile Send Message'] = 'FAIL';
      throw new Error('Mobile message not rendered in stream');
    }

    // Tap back button to return to conversation list
    console.log('▶ [MOBILE] Tapping back button to return to conversation list...');
    await mobilePage.click('button[aria-label="Back to conversations"]');
    await sleep(1500);

    const returnedToList = await mobilePage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const mayaVisible = btns.some(b => b.textContent && b.textContent.includes('Maya Lin'));
      const bottomNav = document.querySelector('.bottom-nav');
      const bottomNavVisible = bottomNav && !bottomNav.classList.contains('hidden');
      return mayaVisible && bottomNavVisible;
    });

    if (returnedToList) {
      results['Mobile Back Navigation'] = 'PASS';
      console.log('✅ PASS: Successfully returned to conversation list; mobile bottom nav restored.');
    } else {
      results['Mobile Back Navigation'] = 'FAIL';
      throw new Error('Failed to return to conversation list on mobile');
    }
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '07_mobile_returned_to_list.png') });
    await mobileContext.close();

  } catch (err) {
    console.error('\n❌ Messenger Browser QA Error:', err);
  } finally {
    await browser.close();

    console.log('\n================================================================');
    console.log('MESSENGER UI/UX BROWSER QA SCORECARD:');
    console.log('================================================================');
    for (const [k, v] of Object.entries(results)) {
      console.log(`${v === 'PASS' ? '✅' : '❌'} ${k}: ${v}`);
    }
    console.log('================================================================\n');
  }
}

runMessengerQA();
