// scripts/browser-navigation-qa.mjs
// Step 3 Automated Browser QA: Navigation, Back Button, Modal Close & Mobile UX Cleanup

import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(process.cwd(), 'qa_screenshots_step3');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runStep3NavigationQA() {
  console.log('===============================================================');
  console.log('STARTING STEP 3 QA: NAVIGATION, BACK BUTTON & MOBILE UX CLEANUP');
  console.log('===============================================================');

  const results = {};
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    // -------------------------------------------------------------------------
    // TEST 1: DESKTOP DISCOVER -> PROFILE -> BACK BUTTON & CLOSE ACTIONS
    // -------------------------------------------------------------------------
    console.log('\n▶ TEST 1: Discover → Profile Modal → Back & Close Actions...');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Click on Maya's profile card
    await page.waitForFunction(() => {
      const cards = Array.from(document.querySelectorAll('div.group.glass-card'));
      return cards.some((c) => c.textContent && c.textContent.includes('Maya Lin'));
    }, { timeout: 15000 });

    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.group.glass-card'));
      const maya = cards.find((c) => c.textContent && c.textContent.includes('Maya Lin'));
      if (maya) {
        const viewBio = Array.from(maya.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('View Bio'));
        if (viewBio) viewBio.click();
      }
    });
    await sleep(1500);

    // Verify modal is open with both Back button and X button
    await page.waitForSelector('.modal-overlay .modal-content', { timeout: 5000 });
    const hasBackAndX = await page.evaluate(() => {
      const modal = document.querySelector('.modal-overlay .modal-content');
      if (!modal) return { back: false, x: false };
      const backBtn = modal.querySelector('button[aria-label="Back to discover"]');
      const xBtn = modal.querySelector('button[aria-label="Close profile details"]');
      return { back: !!backBtn, x: !!xBtn };
    });

    if (!hasBackAndX.back || !hasBackAndX.x) {
      throw new Error(`Modal missing back or X button: ${JSON.stringify(hasBackAndX)}`);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_profile_modal_open.png') });

    // Click the top-left "Back" button
    await page.click('.modal-overlay .modal-content button[aria-label="Back to discover"]');
    await sleep(800);

    const isClosed1 = await page.evaluate(() => !document.querySelector('.modal-overlay'));
    if (!isClosed1) throw new Error('Profile modal did not close on Back button click');
    console.log('✅ PASS: Profile modal opened and closed cleanly via Top-Left Back button');

    // Reopen profile modal, then test Escape key
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.group.glass-card'));
      const maya = cards.find((c) => c.textContent && c.textContent.includes('Maya Lin'));
      if (maya) {
        const btn = Array.from(maya.querySelectorAll('button')).find((b) => b.textContent.includes('View Bio'));
        if (btn) btn.click();
      }
    });
    await sleep(1200);
    await page.waitForSelector('.modal-overlay .modal-content', { timeout: 5000 });

    // Press Escape
    await page.keyboard.press('Escape');
    await sleep(800);

    const isClosed2 = await page.evaluate(() => !document.querySelector('.modal-overlay'));
    if (!isClosed2) throw new Error('Profile modal did not close on Escape key');
    console.log('✅ PASS: Profile modal closed cleanly via Escape key');

    // Reopen profile modal, then test browser back button (history popstate)
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.group.glass-card'));
      const maya = cards.find((c) => c.textContent && c.textContent.includes('Maya Lin'));
      if (maya) {
        const btn = Array.from(maya.querySelectorAll('button')).find((b) => b.textContent.includes('View Bio'));
        if (btn) btn.click();
      }
    });
    await sleep(1200);
    await page.waitForSelector('.modal-overlay .modal-content', { timeout: 5000 });

    // Simulate browser back button
    await page.goBack();
    await sleep(800);

    const isClosed3 = await page.evaluate(() => !document.querySelector('.modal-overlay'));
    if (!isClosed3) throw new Error('Profile modal did not close on browser Back navigation');
    console.log('✅ PASS: Profile modal closed cleanly via Browser Back button (popstate sync)');

    results['Discover → Profile → Back'] = 'PASS';

    // -------------------------------------------------------------------------
    // TEST 2: AUTHENTICATE & TEST PROFILE -> MESSENGER -> BACK
    // -------------------------------------------------------------------------
    console.log('\n▶ TEST 2: Profile → Messenger → Back to Conversation List...');
    
    // Quick login as Daniel Kim
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signInBtn = btns.find((b) => b.textContent && b.textContent.includes('Sign In'));
      if (signInBtn) signInBtn.click();
    });
    await sleep(1000);
    await page.waitForSelector('.modal-overlay .modal-content', { timeout: 5000 });

    // Click Daniel Kim instant demo button
    await page.evaluate(() => {
      const demoBtns = Array.from(document.querySelectorAll('.modal-overlay button'));
      const daniel = demoBtns.find((b) => b.textContent && b.textContent.includes('Daniel Kim'));
      if (daniel) daniel.click();
    });
    await sleep(2000);

    // Open Maya's profile modal again
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.group.glass-card'));
      const maya = cards.find((c) => c.textContent && c.textContent.includes('Maya Lin'));
      if (maya) {
        const btn = Array.from(maya.querySelectorAll('button')).find((b) => b.textContent.includes('View Bio'));
        if (btn) btn.click();
      }
    });
    await sleep(1500);

    // Click "Send Message" inside Maya's profile modal
    await page.evaluate(() => {
      const modal = document.querySelector('.modal-overlay .modal-content');
      if (modal) {
        const sendBtn = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent.includes('Send Message'));
        if (sendBtn) sendBtn.click();
      }
    });
    await sleep(2500);

    // Verify active chat header is open with Maya Lin
    const chatTitle = await page.evaluate(() => {
      const header = document.querySelector('div.sticky.top-0 h3');
      return header ? header.textContent : '';
    });
    console.log('Active conversation header:', chatTitle);
    if (!chatTitle || !chatTitle.includes('Maya')) {
      throw new Error(`Did not navigate to Maya conversation: ${chatTitle}`);
    }
    console.log('✅ PASS: Profile → Send Message navigated to Messenger with Maya active');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_active_chat_from_profile.png') });

    results['Profile → Messenger → Back'] = 'PASS';

    // -------------------------------------------------------------------------
    // TEST 3: MESSENGER CONVERSATION -> CONVERSATION LIST (ON MOBILE VIEWPORT)
    // -------------------------------------------------------------------------
    console.log('\n▶ TEST 3: Messenger conversation → conversation list (Mobile 390px)...');
    await page.setViewport({ width: 390, height: 844 });
    await sleep(1000);

    // Verify mobile chat back button is visible
    const mobileBackBtn = await page.$('button[aria-label="Back to conversation list"]');
    if (!mobileBackBtn) {
      throw new Error('Mobile back button missing in active chat header');
    }

    // Click mobile back button
    await mobileBackBtn.click();
    await sleep(1000);

    // Verify active chat is closed and conversation list is visible
    const inConvList = await page.evaluate(() => {
      const list = document.querySelector('.overflow-y-auto');
      const input = document.querySelector('input[placeholder*="Write a message"]');
      return !!list && !input;
    });

    if (!inConvList) {
      throw new Error('Did not return to conversation list after clicking back button');
    }
    console.log('✅ PASS: Mobile back button returned from active chat to conversation list');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_mobile_conversation_list.png') });

    // Test Browser Back button in chat: reopen chat, then press page.goBack()
    await page.evaluate(() => {
      const convBtns = Array.from(document.querySelectorAll('button'));
      const mayaConv = convBtns.find((b) => b.textContent && b.textContent.includes('Maya'));
      if (mayaConv) mayaConv.click();
    });
    await sleep(1500);

    // Check that chat input is open
    const hasChat = await page.evaluate(() => !!document.querySelector('input[placeholder*="Write a message"]'));
    if (!hasChat) throw new Error('Chat did not reopen');

    // Simulate mobile hardware back button (popstate)
    await page.goBack();
    await sleep(1000);

    const backToList = await page.evaluate(() => !document.querySelector('input[placeholder*="Write a message"]'));
    if (!backToList) throw new Error('Browser back button did not return to conversation list');
    console.log('✅ PASS: Hardware/browser back button popped active chat back to conversation list');

    results['Messenger conversation → conversation list'] = 'PASS';

    // -------------------------------------------------------------------------
    // TEST 4: MAIN NAVIGATION (DISCOVER / MESSENGER / PROFILE) & ACTIVE STATES
    // -------------------------------------------------------------------------
    console.log('\n▶ TEST 4: Main 3-Area Navigation & Mobile Touch Ergonomics...');
    
    // Test tapping Discover tab from Messenger
    await page.evaluate(() => {
      const navBtns = Array.from(document.querySelectorAll('nav.bottom-nav button'));
      const discover = navBtns.find((b) => b.getAttribute('aria-label') === 'Discover');
      if (discover) discover.click();
    });
    await sleep(1500);

    // Verify Discover is active
    const discoverActive = await page.evaluate(() => {
      const btn = document.querySelector('nav.bottom-nav button[aria-label="Discover"]');
      return btn ? btn.classList.contains('active') : false;
    });
    if (!discoverActive) throw new Error('Discover button not marked active in bottom nav');
    console.log('✅ PASS: Discover tab highlighted as active in bottom nav');

    // Test tapping Profile tab
    await page.evaluate(() => {
      const navBtns = Array.from(document.querySelectorAll('nav.bottom-nav button'));
      const profile = navBtns.find((b) => b.getAttribute('aria-label') === 'Profile');
      if (profile) profile.click();
    });
    await sleep(1500);

    const profileActive = await page.evaluate(() => {
      const btn = document.querySelector('nav.bottom-nav button[aria-label="Profile"]');
      return btn ? btn.classList.contains('active') : false;
    });
    if (!profileActive) throw new Error('Profile button not marked active in bottom nav');
    console.log('✅ PASS: Profile tab highlighted as active in bottom nav');

    // Return to Discover
    await page.evaluate(() => {
      const navBtns = Array.from(document.querySelectorAll('nav.bottom-nav button'));
      const discover = navBtns.find((b) => b.getAttribute('aria-label') === 'Discover');
      if (discover) discover.click();
    });
    await sleep(1200);

    results['Main navigation active states & 3-area flow'] = 'PASS';

    // -------------------------------------------------------------------------
    // TEST 5: MOBILE VIEWPORTS & HORIZONTAL OVERFLOW PREVENTION
    // -------------------------------------------------------------------------
    console.log('\n▶ TEST 5: Mobile Viewport Audits (375px, 390px, 412px)...');
    const viewports = [
      { width: 375, height: 667, name: 'iPhone SE (375px)' },
      { width: 390, height: 844, name: 'iPhone 14 (390px)' },
      { width: 412, height: 915, name: 'Pixel 7 (412px)' },
    ];

    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await sleep(1000);

      const overflow = await page.evaluate((expectedWidth) => {
        const bodyScrollWidth = document.body.scrollWidth;
        const htmlScrollWidth = document.documentElement.scrollWidth;
        const windowWidth = window.innerWidth;
        return {
          windowWidth,
          bodyScrollWidth,
          htmlScrollWidth,
          hasOverflow: bodyScrollWidth > windowWidth || htmlScrollWidth > windowWidth,
        };
      }, vp.width);

      console.log(`Viewport ${vp.name}: window=${overflow.windowWidth}px, bodyScroll=${overflow.bodyScrollWidth}px, overflow=${overflow.hasOverflow}`);
      if (overflow.hasOverflow) {
        throw new Error(`Horizontal overflow detected on ${vp.name}: body=${overflow.bodyScrollWidth}px > window=${overflow.windowWidth}px`);
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `04_viewport_${vp.width}px.png`) });
    }
    console.log('✅ PASS: Zero horizontal overflow across all 3 phone viewport sizes');
    results['Mobile viewports (375px, 390px, 412px)'] = 'PASS';

    // -------------------------------------------------------------------------
    // TEST 6: CHAT COMPOSER MOBILE KEYBOARD & TOUCH SIZES
    // -------------------------------------------------------------------------
    console.log('\n▶ TEST 6: Chat Composer Mobile Touch Targets & iOS Font Size Audit...');
    await page.setViewport({ width: 390, height: 844 });
    
    // Switch to Messenger
    await page.evaluate(() => {
      const navBtns = Array.from(document.querySelectorAll('nav.bottom-nav button'));
      const messenger = navBtns.find((b) => b.getAttribute('aria-label') === 'Messenger');
      if (messenger) messenger.click();
    });
    await sleep(1500);

    // Open Maya's conversation
    await page.evaluate(() => {
      const convBtns = Array.from(document.querySelectorAll('button'));
      const mayaConv = convBtns.find((b) => b.textContent && b.textContent.includes('Maya'));
      if (mayaConv) mayaConv.click();
    });
    await sleep(1500);

    // Audit composer input font size (must be >= 16px to prevent iOS auto-zoom)
    const composerAudit = await page.evaluate(() => {
      const input = document.querySelector('form input[placeholder*="Write a message"]');
      const sendBtn = document.querySelector('form button[aria-label="Send message"]');
      const backBtn = document.querySelector('button[aria-label="Back to conversation list"]');

      const inputFontSize = input ? parseFloat(window.getComputedStyle(input).fontSize) : 0;
      const sendRect = sendBtn ? sendBtn.getBoundingClientRect() : { width: 0, height: 0 };
      const backRect = backBtn ? backBtn.getBoundingClientRect() : { width: 0, height: 0 };

      return {
        inputFontSize,
        sendWidth: sendRect.width,
        sendHeight: sendRect.height,
        backWidth: backRect.width,
        backHeight: backRect.height,
      };
    });

    console.log('Mobile composer audit:', composerAudit);
    if (composerAudit.inputFontSize < 16) {
      throw new Error(`Input font size is ${composerAudit.inputFontSize}px (< 16px causes unwanted iOS zoom!)`);
    }
    if (composerAudit.sendWidth < 44 || composerAudit.sendHeight < 44) {
      throw new Error(`Send button touch target < 44px: ${composerAudit.sendWidth}x${composerAudit.sendHeight}`);
    }
    if (composerAudit.backWidth < 44 || composerAudit.backHeight < 44) {
      throw new Error(`Back button touch target < 44px: ${composerAudit.backWidth}x${composerAudit.backHeight}`);
    }
    console.log('✅ PASS: Chat composer input has >= 16px font-size (no iOS zoom) and touch targets are >= 44x44px');
    results['Mobile composer usability & touch targets'] = 'PASS';

    // -------------------------------------------------------------------------
    // TEST 7: ADMIN CRM MODAL CLOSE & MOBILE NAVIGATION
    // -------------------------------------------------------------------------
    console.log('\n▶ TEST 7: Admin CRM Navigation & Modal Close Actions...');
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    // Ensure we are logged in as staff
    const needsStaffLogin = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some((b) => b.textContent && b.textContent.includes('Super Admin'));
    });
    if (needsStaffLogin) {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const b = btns.find((x) => x.textContent && x.textContent.includes('Super Admin'));
        if (b) b.click();
      });
      await sleep(2500);
    }

    // Open User Management to test Assign Lead modal
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      return btns.some((x) => x.textContent && x.textContent.includes('User Management'));
    }, { timeout: 10000 });

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      const b = btns.find((x) => x.textContent && x.textContent.includes('User Management'));
      if (b) b.click();
    });
    await sleep(2000);

    // Click assign on first row
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      if (rows.length > 0) {
        const btn = rows[0].querySelector('button');
        if (btn) btn.click();
      }
    });
    await sleep(1000);

    // Verify Assign modal has 'X' close button
    const hasAssignX = await page.evaluate(() => {
      const modal = document.querySelector('.modal-overlay .modal-content');
      if (!modal) return false;
      const xBtn = modal.querySelector('button[aria-label="Close assignment dialog"]');
      return !!xBtn;
    });

    if (!hasAssignX) throw new Error('Assign Lead modal missing explicit X close button');

    // Click X to close
    await page.click('.modal-overlay .modal-content button[aria-label="Close assignment dialog"]');
    await sleep(800);

    const isAssignClosed = await page.evaluate(() => !document.querySelector('.modal-overlay'));
    if (!isAssignClosed) throw new Error('Assign modal did not close on X click');
    console.log('✅ PASS: Admin Assign modal has reliable X close button');

    // Reopen assign modal and test Escape key
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      if (rows.length > 0) {
        const btn = rows[0].querySelector('button');
        if (btn) btn.click();
      }
    });
    await sleep(1000);
    await page.keyboard.press('Escape');
    await sleep(800);

    const isAssignClosedEsc = await page.evaluate(() => !document.querySelector('.modal-overlay'));
    if (!isAssignClosedEsc) throw new Error('Assign modal did not close on Escape key');
    console.log('✅ PASS: Admin modal closed on Escape key');

    results['Admin modal close behavior & Escape key'] = 'PASS';

    // -------------------------------------------------------------------------
    // TEST 8: DESKTOP UX CLEANLINESS & REMAINING ESSENTIALS
    // -------------------------------------------------------------------------
    console.log('\n▶ TEST 8: Desktop UX Verification...');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await sleep(1500);

    const desktopHeaderNav = await page.evaluate(() => {
      const nav = document.querySelector('header nav');
      const bottomNav = document.querySelector('nav.bottom-nav');
      return {
        hasDesktopNav: !!nav && window.getComputedStyle(nav).display !== 'none',
        bottomNavHiddenOnDesktop: !!bottomNav && window.getComputedStyle(bottomNav).display === 'none',
      };
    });

    if (!desktopHeaderNav.hasDesktopNav || !desktopHeaderNav.bottomNavHiddenOnDesktop) {
      throw new Error(`Desktop layout mismatch: ${JSON.stringify(desktopHeaderNav)}`);
    }
    console.log('✅ PASS: Desktop layout clean, header navigation active, mobile bottom nav hidden');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_desktop_layout_clean.png') });
    results['Desktop UX layout'] = 'PASS';

  } catch (err) {
    console.error('❌ Step 3 QA Failure:', err);
    throw err;
  } finally {
    if (browser) await browser.close();
  }

  console.log('\n===============================================================');
  console.log('FINAL STEP 3 BROWSER QA TEST RESULTS:');
  console.log('===============================================================');
  for (const [name, status] of Object.entries(results)) {
    console.log(`✅ ${name}: ${status}`);
  }
  console.log('===============================================================');
  return results;
}

runStep3NavigationQA()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
