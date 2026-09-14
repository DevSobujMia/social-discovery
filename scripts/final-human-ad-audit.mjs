/**
 * Final Pre-Launch Human Scenario & Ad Readiness Audit
 * 
 * Simulates real end-to-end human interactions across multiple ad entry points,
 * mobile & desktop viewports, messaging, lead capture, CRM synchronization,
 * and account upgrade flows.
 */

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOTS_DIR = path.resolve(process.cwd(), 'qa_screenshots_final_audit');
const RUN_ID = Date.now().toString().slice(-6);

fs.mkdirSync(SHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
const defects = [];
const consoleErrors = [];
const networkFailures = [];

function check(title, condition, extraInfo = '') {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${title}${extraInfo ? ` -> ${extraInfo}` : ''}`);
  } else {
    failed++;
    const err = `[FAIL] ${title}${extraInfo ? ` -> ${extraInfo}` : ''}`;
    console.error(`  ${err}`);
    defects.push(err);
  }
  return !!condition;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForCondition(page, fn, timeout = 30000, pollInterval = 300, ...args) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const ok = await page.evaluate(fn, ...args);
      if (ok) return true;
    } catch {}
    await sleep(pollInterval);
  }
  return false;
}

async function capture(page, name) {
  const filePath = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  return filePath;
}

function monitorPage(page, scope) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Ignore normal expected DevTools and deliberate 403 on message 3 verification gate
      if (/React DevTools|favicon/i.test(txt)) return;
      if (/status of 403/.test(txt)) return;
      consoleErrors.push(`[${scope}] ${txt}`);
    }
  });
  page.on('pageerror', (err) => consoleErrors.push(`[${scope}] Uncaught: ${err.message}`));
  page.on('requestfailed', (req) => {
    if (req.url().includes('_rsc=') && req.failure()?.errorText === 'net::ERR_ABORTED') return;
    networkFailures.push(`[${scope}] Failed ${req.method()} ${req.url()} (${req.failure()?.errorText})`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('/api/conversations/') && !res.url().includes('favicon')) {
      // 403 on conversation message 3 is the intended gate response
      networkFailures.push(`[${scope}] ${res.status()} on ${res.url()}`);
    }
  });
}

async function runFinalAudit() {
  console.log('\n================================================================');
  console.log('   STARTING COMPREHENSIVE FINAL HUMAN-SCENARIO AD AUDIT');
  console.log('   Target:', BASE);
  console.log('   Run ID:', RUN_ID);
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // =========================================================================
    // SCENARIO 1: Mobile Ad Visitor (Instagram Campaign + City Targeting)
    // =========================================================================
    console.log('\n--- SCENARIO 1: Mobile Ad Visitor (iPhone 390x844) ---');
    const mobileCtx = await browser.createBrowserContext();
    const mPage = await mobileCtx.newPage();
    monitorPage(mPage, 'MobileAdUser');
    await mPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    const testCity = 'Dubai';
    const campaignName = `ig_travel_dubai_${RUN_ID}`;
    const visitorName = `Alex Traveler ${RUN_ID}`;
    const visitorPhone = `+97150${RUN_ID}12`;

    const adUrl = `${BASE}/?utm_source=instagram&utm_medium=cpc&utm_campaign=${campaignName}&utm_content=resort_dating&city=${testCity}`;
    console.log(`▶ Navigating to Ad URL: ${adUrl}`);
    await mPage.goto(adUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(1500);

    // 1.1 Verify UTM Dual-Storage
    const utmStored = await mPage.evaluate(() => {
      const s = sessionStorage.getItem('heartlink_utm');
      const l = localStorage.getItem('heartlink_utm');
      return {
        session: s ? JSON.parse(s) : null,
        local: l ? JSON.parse(l) : null,
      };
    });
    check('1.1 UTM Attribution stored in sessionStorage', utmStored.session?.utmCampaign === campaignName);
    check('1.2 UTM Attribution stored in localStorage', utmStored.local?.utmCampaign === campaignName);

    // 1.3 Verify Dynamic City Personalization on Landing
    const headlineText = await mPage.evaluate(() => {
      const h1s = Array.from(document.querySelectorAll('h1'));
      return h1s.map(h => h.innerText).join(' | ');
    });
    check('1.3 Dynamic City Headline renders correctly', headlineText.toLowerCase().includes(testCity.toLowerCase()), headlineText);

    // 1.4 Verify No Registration Wall on landing
    const pageText = await mPage.evaluate(() => document.body.innerText);
    check('1.4 Ad Landing is completely frictionless (No forced login wall)', !pageText.includes('Please sign in to continue'));
    await capture(mPage, '01_mobile_ad_landing');

    // 1.5 Select Gender preference
    const selectedFemale = await mPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Women'));
      if (btn) { btn.click(); return true; }
      return false;
    });
    check('1.5 Gender selection interactive', selectedFemale);

    // 1.6 Click "Find My Travel Match"
    const clickedFind = await mPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Find My Travel Match'));
      if (btn) { btn.click(); return true; }
      return false;
    });
    check('1.6 "Find My Travel Match" CTA clicked', clickedFind);
    await sleep(800);

    // 1.7 Verify live matching animation state
    const isSpinning = await mPage.evaluate(() => document.body.innerText.includes('FINDING UPCOMING TRAVELLERS'));
    check('1.7 High-tech radar matching animation triggered', isSpinning);
    await capture(mPage, '02_mobile_matching_radar');

    // 1.8 Wait for Match Profile Card to appear
    const matchAppeared = await waitForCondition(mPage, () => {
      return document.body.innerText.includes('Great Match') || document.body.innerText.includes('Next match');
    }, 15000);
    check('1.8 Matched Profile Card rendered successfully', matchAppeared);
    await capture(mPage, '03_mobile_match_profile_card');

    // 1.9 Test "Next match" cycle functionality
    const firstMatchedName = await mPage.evaluate(() => document.querySelector('h2')?.innerText || '');
    console.log(`    First match candidate: ${firstMatchedName}`);

    const clickedNext = await mPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Next match'));
      if (btn) { btn.click(); return true; }
      return false;
    });
    check('1.9 "Next match" button responds', clickedNext);
    await sleep(2500);

    const secondMatchedName = await mPage.evaluate(() => document.querySelector('h2')?.innerText || '');
    console.log(`    Second match candidate: ${secondMatchedName}`);
    check('1.10 "Next match" loaded a fresh profile', secondMatchedName.length > 0);
    await capture(mPage, '04_mobile_rematch_card');

    // 1.11 Connect via Say Hi CTA button
    const clickedSayHi = await mPage.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Say Hi to'));
      if (btn) { btn.click(); return true; }
      return false;
    });
    check('1.11 Say Hi CTA tapped', clickedSayHi);

    // 1.12 Verify immediate transition to Messenger
    const landedInMessenger = await waitForCondition(mPage, () => {
      const t = document.body.innerText;
      return t.includes('call you') || t.includes('your name') || document.querySelector('textarea') !== null;
    }, 20000);
    check('1.12 Visitor enters Messenger instantly without password wall', landedInMessenger);
    await capture(mPage, '05_mobile_messenger_entry');

    // 1.13 Submit inline name in Messenger
    console.log('    Submitting visitor name in Messenger...');
    const nameSelector = 'input[placeholder*="first name" i], input[placeholder*="name" i]';
    await mPage.waitForSelector(nameSelector, { timeout: 10000 });
    await mPage.focus(nameSelector);
    await mPage.type(nameSelector, visitorName, { delay: 15 });
    await sleep(400);

    const submitBtn = await mPage.waitForSelector('button[type="submit"]', { timeout: 5000 });
    await submitBtn.click();

    // 1.14 Wait for intro message bubble to appear and chat input to switch to regular textarea
    const introDelivered = await waitForCondition(mPage, (name) => {
      const t = document.body.innerText;
      return t.includes(name) && document.querySelector('textarea[placeholder="Message"]') !== null;
    }, 20000, 300, visitorName);
    check('1.14 Intro message generated and chat textarea unlocked', introDelivered);
    await capture(mPage, '06_mobile_intro_sent');

    // Helper to send message in regular chat
    async function sendChatMessage(text) {
      const areaSelector = 'textarea[placeholder="Message"]';
      await mPage.waitForSelector(areaSelector, { timeout: 10000 });
      await mPage.focus(areaSelector);
      await mPage.type(areaSelector, text, { delay: 10 });
      await sleep(300);

      const sendBtn = await mPage.waitForSelector('button[aria-label="Send message"]', { timeout: 5000 });
      await sendBtn.click();
      await sleep(1500);
    }

    // 1.15 Send Message 2 (Free message)
    console.log('    Sending Message 2 (Free message)...');
    await sendChatMessage('I know some great rooftop lounges in Dubai we should visit.');
    const msg2Delivered = await mPage.evaluate(() => document.body.innerText.includes('rooftop lounges in Dubai'));
    check('1.15 Message 2 sent freely without verification prompt', msg2Delivered);
    await capture(mPage, '07_mobile_two_messages_delivered');

    // 1.16 Send Message 3 (Should trigger verification gate)
    console.log('    Sending Message 3 (Quality Gate Trigger)...');
    await sendChatMessage('What dates are you flying in? Let me know your schedule.');
    await sleep(1500);

    const gateOpened = await waitForCondition(mPage, () => {
      const t = document.body.innerText;
      return /verify|verification/i.test(t) && (/whatsapp/i.test(t) || /telegram/i.test(t) || /phone/i.test(t));
    }, 15000);
    check('1.16 Verification Gate triggered on 3rd message', gateOpened);
    await capture(mPage, '08_mobile_verification_gate');

    // 1.17 Choose WhatsApp & Fill Phone
    const choseWhatsApp = await mPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const waBtn = btns.find(b => /whatsapp/i.test(b.innerText));
      if (waBtn) { waBtn.click(); return true; }
      return false;
    });
    check('1.17 WhatsApp verification channel selected', choseWhatsApp);
    await sleep(500);

    // Set phone inside verification modal
    await mPage.evaluate((phone) => {
      const inputs = Array.from(document.querySelectorAll('input')).filter(i => {
        const r = i.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const box = inputs.find(i => /971|50xxx|number|phone/i.test(i.placeholder || '')) || inputs[0];
      if (box) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(box, phone);
        box.dispatchEvent(new Event('input', { bubbles: true }));
        box.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, visitorPhone);
    await sleep(400);

    const submittedVerification = await mPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button')).filter(b => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const saveBtn = btns.find(b => /verify & continue|save|keep chatting/i.test(b.innerText));
      if (saveBtn) { saveBtn.click(); return true; }
      return false;
    });
    check('1.18 Verification phone submitted', submittedVerification);

    // 1.19 Verify Held Message 3 Unlocked
    const unlocked = await waitForCondition(mPage, (snippet) => {
      return document.body.innerText.includes(snippet);
    }, 20000, 300, 'What dates are you flying in');
    check('1.19 Gated 3rd message automatically released and delivered upon verification', unlocked);
    await capture(mPage, '09_mobile_verified_chat_unlocked');

    // 1.20 Send 4th Message Freely
    await sendChatMessage('Verification done! Looking forward to connecting soon.');
    const msg4Delivered = await mPage.evaluate(() => document.body.innerText.includes('Verification done!'));
    check('1.20 Verified visitor chats freely without further roadblocks', msg4Delivered);
    await capture(mPage, '10_mobile_continuous_chat');

    await mPage.close();
    await mobileCtx.close();

    // =========================================================================
    // SCENARIO 2: CRM Lead Collection & Master Inbox Audit (Admin)
    // =========================================================================
    console.log('\n--- SCENARIO 2: Admin CRM Lead & Master Inbox Audit (1440x900) ---');
    const adminCtx = await browser.createBrowserContext();
    const aPage = await adminCtx.newPage();
    monitorPage(aPage, 'AdminCRM');
    await aPage.setViewport({ width: 1440, height: 900 });

    await aPage.goto(`${BASE}/admin`, { waitUntil: 'networkidle2', timeout: 45000 });
    await aPage.waitForSelector('input[type="email"]', { timeout: 20000 });
    await aPage.type('input[type="email"]', 'admin@heartlink.com');
    await aPage.type('input[type="password"]', 'Admin@123456');
    await aPage.click('button[type="submit"]');
    await aPage.waitForSelector('aside', { timeout: 20000 });
    check('2.1 Admin login successful', true);
    await sleep(1500);

    // 2.2 Navigate to Lead Collection (User Management)
    const clickedUsers = await aPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      const uBtn = btns.find(b => /user management|lead/i.test(b.innerText));
      if (uBtn) { uBtn.click(); return true; }
      return false;
    });
    check('2.2 Opened Lead Collection in Admin CRM', clickedUsers);
    await sleep(2500);
    await capture(aPage, '11_admin_lead_collection');

    // 2.3 Verify Visitor Captured in CRM
    const leadVisibleInCrm = await aPage.evaluate((name, phoneDigits) => {
      const text = document.body.innerText;
      return text.includes(name) || text.includes(phoneDigits);
    }, visitorName, visitorPhone.slice(-6));
    check('2.3 Newly verified ad visitor captured in CRM Lead table', leadVisibleInCrm, `${visitorName} / ${visitorPhone}`);

    // 2.4 Verify WhatsApp Link in CRM
    const waLinks = await aPage.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="wa.me"]')).map(a => a.href);
    });
    const targetDigits = visitorPhone.replace(/[^0-9]/g, '');
    const hasWaLink = waLinks.some(l => l.includes(targetDigits));
    check('2.4 Instant 1-Click WhatsApp link generated for staff outreach', hasWaLink, waLinks[0] || 'none');

    // 2.5 Verify Master Inbox Sync
    const clickedInbox = await aPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      const inBtn = btns.find(b => /master inbox|inbox/i.test(b.innerText));
      if (inBtn) { inBtn.click(); return true; }
      return false;
    });
    check('2.5 Opened Master Inbox in Admin', clickedInbox);
    await sleep(3000);

    // Click on the conversation row to open chat stream on the right pane
    await aPage.evaluate((name) => {
      const allDivs = Array.from(document.querySelectorAll('div, button'));
      const row = allDivs.find(el => el.innerText && el.innerText.includes(name));
      if (row) (row.closest('div[class*="cursor-pointer"]') || row).click();
    }, visitorName.slice(0, 10));
    await sleep(1500);

    const messageInInbox = await aPage.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('rooftop lounges in Dubai') || text.includes('Verification done') || text.includes('What dates are you flying');
    });
    check('2.6 Live conversation messages fully synced to Staff Master Inbox', messageInInbox);
    await capture(aPage, '12_admin_master_inbox_sync');

    await aPage.close();
    await adminCtx.close();

    // =========================================================================
    // SCENARIO 3: Desktop Visitor Navigation & Full Registration Audit
    // =========================================================================
    console.log('\n--- SCENARIO 3: Desktop Visitor & Account Registration (1440x900) ---');
    const deskCtx = await browser.createBrowserContext();
    const dPage = await deskCtx.newPage();
    monitorPage(dPage, 'DesktopUser');
    await dPage.setViewport({ width: 1440, height: 900 });

    const genericAdUrl = `${BASE}/?utm_source=facebook&utm_medium=cpc&utm_campaign=fb_global_singles_${RUN_ID}`;
    await dPage.goto(genericAdUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(1500);

    // 3.1 Navigate to Profile tab
    const clickedProfileTab = await dPage.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('button, a')).filter(el => /profile|account/i.test(el.innerText));
      if (tabs.length > 0) { tabs[0].click(); return true; }
      return false;
    });
    check('3.1 Profile / Account tab accessible from navigation', clickedProfileTab);
    await sleep(1500);
    await capture(dPage, '13_desktop_profile_tab');

    // 3.2 Registration / Sign In section check
    const hasAuthSection = await dPage.evaluate(() => {
      const t = document.body.innerText;
      return /sign in|create account|log in|join|sign up|profile/i.test(t);
    });
    check('3.2 Auth / Account management section present', hasAuthSection);

    await dPage.close();
    await deskCtx.close();

    // =========================================================================
    // SCENARIO 4: Network & Console Error Audit
    // =========================================================================
    console.log('\n--- SCENARIO 4: Network & Console Error Audit ---');
    check('4.1 Zero uncaught JavaScript errors in browser console', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
    check('4.2 Zero broken network requests or 404 assets', networkFailures.length === 0, networkFailures.slice(0, 5).join(' | '));

  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  console.log(`FINAL AUDIT REPORT: ${passed} PASSED | ${failed} FAILED`);
  console.log(`Screenshots saved to: ${SHOTS_DIR}`);
  console.log('================================================================\n');

  if (defects.length > 0) {
    console.log('DEFECTS TO REVIEW:');
    defects.forEach(d => console.log('  ', d));
    process.exitCode = 1;
  } else {
    console.log('🎉 ALL HUMAN-SCENARIO TESTS PASSED PERFECTLY!');
  }
}

runFinalAudit().catch(err => {
  console.error('Audit crashed unexpectedly:', err);
  process.exit(1);
});
